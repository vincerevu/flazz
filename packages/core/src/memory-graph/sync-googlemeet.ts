import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BackgroundService } from "../services/background_service.js";
import { WorkDir } from "../config/config.js";
import { executeAction } from "../composio/client.js";
import { composioAccountsRepo } from "../composio/repo.js";
import { serviceLogger, type ServiceRunContext } from "../services/service_logger.js";
import { limitEventItems } from "./limit-event-items.js";
import { triggerGraphBuilderNow } from "./build-graph.js";

const SYNC_DIR = path.join(WorkDir, "googlemeet_sync");
const STATE_FILE = path.join(WorkDir, "googlemeet_sync_state.json");
const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const MAX_BATCH_SIZE = 20;

type SyncState = {
  syncedMeetings?: Record<string, string>;
  lastCheckTime?: string;
};

type TranscriptLine = {
  speaker?: string;
  text: string;
  timestamp?: string;
};

type GoogleMeetSource = {
  conferenceRecordId: string;
  title: string;
  meetingCode?: string;
  spaceName?: string;
  meetingUri?: string;
  startAt?: string;
  endAt?: string;
  participants: string[];
  recordings: unknown[];
  transcripts: unknown[];
  transcriptLines: TranscriptLine[];
  transcriptBlocks: string[];
  raw: {
    conferenceRecord: unknown;
    meet: unknown;
    participantSessions: unknown[];
    recordings: unknown[];
    transcripts: unknown[];
  };
};

let isRunning = false;
let wakeResolve: (() => void) | null = null;

function triggerSync(): void {
  if (wakeResolve) {
    console.log("[GoogleMeet] Triggered - waking up immediately");
    wakeResolve();
    wakeResolve = null;
  }
}

function interruptibleSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      wakeResolve = null;
      resolve();
    }, ms);
    wakeResolve = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function extractCollection(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;
  const keys = [
    "items",
    "results",
    "records",
    "conferenceRecords",
    "recordings",
    "transcripts",
    "participantSessions",
    "sessions",
    "data",
  ];
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [record];
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function cleanFilename(name: string): string {
  return name.replace(/[\\/*?:"<>|]/g, "_").substring(0, 100).trim() || "meeting";
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadState(): SyncState {
  if (!fs.existsSync(STATE_FILE)) {
    return { syncedMeetings: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as SyncState;
  } catch {
    return { syncedMeetings: {} };
  }
}

function saveState(state: SyncState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function hashPayload(value: unknown) {
  return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function parseIsoDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDuration(startAt?: string, endAt?: string) {
  const start = parseIsoDate(startAt);
  const end = parseIsoDate(endAt);
  if (!start || !end) return undefined;
  const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatRelativeTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const mins = Math.floor(value / 60);
    const secs = Math.floor(value % 60);
    return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}]`;
  }
  return "";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function collectTextBlocks(value: unknown, blocks: string[] = []): string[] {
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (normalized.length >= 20) {
      blocks.push(normalized);
    }
    return blocks;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTextBlocks(entry, blocks);
    }
    return blocks;
  }
  const record = asRecord(value);
  for (const entry of Object.values(record)) {
    collectTextBlocks(entry, blocks);
  }
  return blocks;
}

function collectTranscriptLines(value: unknown, lines: TranscriptLine[] = [], seen = new Set<string>()): TranscriptLine[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTranscriptLines(entry, lines, seen);
    }
    return lines;
  }

  const record = asRecord(value);
  if (!Object.keys(record).length) {
    return lines;
  }

  const childCollections = ["entries", "segments", "sentences", "turns", "items", "results", "transcript", "content"];
  for (const key of childCollections) {
    if (record[key] !== undefined) {
      collectTranscriptLines(record[key], lines, seen);
    }
  }

  const text = pickString(record, ["text", "transcript", "content", "body", "snippet"]);
  if (!text) {
    return lines;
  }

  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return lines;
  }

  const speaker = pickString(record, ["speaker_name", "speakerName", "speaker", "displayName", "name"]);
  const timestamp = formatRelativeTimestamp(
    record.start_time ?? record.startTime ?? record.offsetSeconds ?? record.offset_seconds,
  );
  const signature = `${speaker ?? ""}|${timestamp}|${normalizedText}`;
  if (seen.has(signature)) {
    return lines;
  }
  seen.add(signature);
  lines.push({
    speaker,
    text: normalizedText,
    timestamp: timestamp || undefined,
  });
  return lines;
}

function extractParticipants(data: unknown) {
  const sessions = extractCollection(data);
  const participants = sessions
    .map((entry) => {
      const record = asRecord(entry);
      const user = asRecord(record.user);
      return (
        pickString(record, ["displayName", "name", "email"]) ??
        pickString(user, ["displayName", "name", "email"])
      );
    })
    .filter((entry): entry is string => !!entry);
  return Array.from(new Set(participants));
}

async function executeOptionalAction(actionSlug: string, connectedAccountId: string, input: Record<string, unknown>) {
  try {
    const result = await executeAction(actionSlug, connectedAccountId, input);
    return result.success ? result.data : null;
  } catch (error) {
    console.warn(`[GoogleMeet] Optional action ${actionSlug} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function meetingToMarkdown(source: GoogleMeetSource): string {
  const date = parseIsoDate(source.startAt ?? source.endAt);
  let md = `# ${source.title}\n\n`;
  md += `**Conference Record ID:** ${source.conferenceRecordId}\n`;
  if (date) {
    md += `**Date:** ${date.toLocaleString()}\n`;
  }
  if (source.meetingCode) {
    md += `**Meeting Code:** ${source.meetingCode}\n`;
  }
  if (source.spaceName) {
    md += `**Space Name:** ${source.spaceName}\n`;
  }
  if (source.meetingUri) {
    md += `**Meeting Link:** ${source.meetingUri}\n`;
  }
  const duration = formatDuration(source.startAt, source.endAt);
  if (duration) {
    md += `**Duration:** ${duration}\n`;
  }
  if (source.participants.length > 0) {
    md += `**Participants:** ${source.participants.join(", ")}\n`;
  }
  md += `**Transcript Artifacts:** ${source.transcripts.length}\n`;
  md += `**Recording Artifacts:** ${source.recordings.length}\n`;
  md += `\n---\n\n`;

  if (source.transcriptBlocks.length > 0) {
    md += `## Overview\n\n${source.transcriptBlocks.slice(0, 3).join("\n\n")}\n\n`;
  }

  if (source.recordings.length > 0) {
    md += `## Recordings\n\n`;
    for (const recording of source.recordings.slice(0, 10)) {
      const record = asRecord(recording);
      const label =
        pickString(record, ["name", "title", "recordingUri", "uri", "downloadUri"]) ??
        "Recording";
      md += `- ${label}\n`;
    }
    md += `\n`;
  }

  if (source.transcripts.length > 0) {
    md += `## Transcript Artifacts\n\n`;
    for (const transcript of source.transcripts.slice(0, 10)) {
      const record = asRecord(transcript);
      const label =
        pickString(record, ["name", "title", "uri", "transcriptUri"]) ??
        "Transcript";
      md += `- ${label}\n`;
    }
    md += `\n`;
  }

  if (source.transcriptLines.length > 0) {
    md += `## Transcript\n\n`;
    let currentSpeaker = "";
    for (const line of source.transcriptLines) {
      const speaker = line.speaker ?? "Unknown";
      if (speaker !== currentSpeaker) {
        md += `\n### ${speaker}\n`;
        currentSpeaker = speaker;
      }
      md += `${line.timestamp ? `${line.timestamp} ` : ""}${line.text}\n`;
    }
    md += `\n`;
  } else if (source.transcriptBlocks.length > 0) {
    md += `## Transcript\n\n${source.transcriptBlocks.join("\n\n")}\n\n`;
  }

  md += `## Structured Payload\n\n\`\`\`json\n${JSON.stringify(source.raw, null, 2)}\n\`\`\`\n`;
  return md;
}

async function buildMeetingSource(
  connectedAccountId: string,
  conferenceRecord: unknown,
): Promise<GoogleMeetSource | null> {
  const conferenceRecordObj = asRecord(conferenceRecord);
  const conferenceRecordId = pickString(conferenceRecordObj, [
    "conferenceRecord_id",
    "conferenceRecordId",
    "name",
    "id",
  ]);
  if (!conferenceRecordId) {
    return null;
  }

  const spaceName = pickString(conferenceRecordObj, ["space_name", "spaceName", "space", "meetingSpace", "name"]);
  const meetingCode = pickString(conferenceRecordObj, ["meeting_code", "meetingCode", "code"]);

  const [meet, participantSessions, recordings, transcripts] = await Promise.all([
    spaceName
      ? executeOptionalAction("GOOGLEMEET_GET_MEET", connectedAccountId, { space_name: spaceName })
      : Promise.resolve(null),
    executeOptionalAction("GOOGLEMEET_LIST_PARTICIPANT_SESSIONS", connectedAccountId, {
      conferenceRecord_id: conferenceRecordId,
    }),
    executeOptionalAction("GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID", connectedAccountId, {
      conferenceRecord_id: conferenceRecordId,
    }),
    executeOptionalAction("GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID", connectedAccountId, {
      conferenceRecord_id: conferenceRecordId,
    }),
  ]);

  const meetObj = asRecord(extractCollection(meet)[0] ?? meet);
  const transcriptItems = extractCollection(transcripts);
  const recordingItems = extractCollection(recordings);
  const participantItems = extractCollection(participantSessions);
  const transcriptLines = collectTranscriptLines(transcriptItems);
  const transcriptBlocks = Array.from(new Set(collectTextBlocks(transcriptItems))).slice(0, 20);
  const participants = extractParticipants(participantItems);

  const title =
    pickString(meetObj, ["title", "name"]) ??
    pickString(conferenceRecordObj, ["title", "name"]) ??
    meetingCode ??
    spaceName ??
    `Google Meet ${conferenceRecordId}`;

  return {
    conferenceRecordId,
    title,
    meetingCode: meetingCode ?? pickString(meetObj, ["meeting_code", "meetingCode"]),
    spaceName,
    meetingUri: pickString(meetObj, ["meetingUri", "meeting_uri", "uri"]),
    startAt:
      pickString(conferenceRecordObj, ["start_time", "startTime", "startAt"]) ??
      pickString(meetObj, ["start_time", "startTime", "startAt"]),
    endAt:
      pickString(conferenceRecordObj, ["end_time", "endTime", "endAt"]) ??
      pickString(meetObj, ["end_time", "endTime", "endAt"]),
    participants,
    recordings: recordingItems,
    transcripts: transcriptItems,
    transcriptLines,
    transcriptBlocks,
    raw: {
      conferenceRecord,
      meet,
      participantSessions: participantItems,
      recordings: recordingItems,
      transcripts: transcriptItems,
    },
  };
}

async function syncGoogleMeet() {
  ensureDir(SYNC_DIR);

  const account = composioAccountsRepo.getAccount("googlemeet");
  if (!account || account.status !== "ACTIVE") {
    console.log("[GoogleMeet] Google Meet not connected via Composio. Skipping sync.");
    return;
  }

  const state = loadState();
  const syncedMeetings = { ...(state.syncedMeetings ?? {}) };
  const lookbackCutoff = new Date();
  lookbackCutoff.setDate(lookbackCutoff.getDate() - LOOKBACK_DAYS);

  const listResult = await executeOptionalAction("GOOGLEMEET_LIST_CONFERENCE_RECORDS", account.id, {});
  const conferenceRecords = extractCollection(listResult).filter((entry) => {
    const record = asRecord(entry);
    const candidateDate = parseIsoDate(
      pickString(record, ["start_time", "startTime", "startAt", "end_time", "endTime", "endAt", "createTime", "create_time"]),
    );
    return !candidateDate || candidateDate >= lookbackCutoff;
  });

  if (conferenceRecords.length === 0) {
    console.log("[GoogleMeet] No conference records found.");
    return;
  }

  let runContext: ServiceRunContext | undefined;
  const ensureRun = async (): Promise<ServiceRunContext> => {
    if (runContext) {
      return runContext;
    }
    runContext = await serviceLogger.startRun({
      service: "googlemeet",
      message: "Syncing Google Meet transcripts",
      trigger: "timer",
    });
    return runContext;
  };

  const recentRecords = conferenceRecords.slice(0, MAX_BATCH_SIZE);
  let newCount = 0;
  let updatedCount = 0;
  const changedTitles: string[] = [];

  for (const record of recentRecords) {
    const source = await buildMeetingSource(account.id, record);
    if (!source) {
      continue;
    }

    const fingerprint = hashPayload({
      startAt: source.startAt,
      endAt: source.endAt,
      participants: source.participants,
      transcriptCount: source.transcripts.length,
      recordingCount: source.recordings.length,
      transcriptLines: source.transcriptLines,
      transcriptBlocks: source.transcriptBlocks,
    });

    if (syncedMeetings[source.conferenceRecordId] === fingerprint) {
      continue;
    }

    await ensureRun();
    changedTitles.push(source.title);

    const meetingDate = parseIsoDate(source.startAt ?? source.endAt) ?? new Date();
    const dateDir = path.join(
      SYNC_DIR,
      String(meetingDate.getFullYear()),
      String(meetingDate.getMonth() + 1).padStart(2, "0"),
      String(meetingDate.getDate()).padStart(2, "0"),
    );
    ensureDir(dateDir);

    const filename = `${cleanFilename(source.title)}.md`;
    const filePath = path.join(dateDir, filename);
    const existed = fs.existsSync(filePath);
    fs.writeFileSync(filePath, meetingToMarkdown(source), "utf8");

    if (existed) {
      updatedCount++;
      console.log(`[GoogleMeet] Updated: ${filename}`);
    } else {
      newCount++;
      console.log(`[GoogleMeet] Saved: ${filename}`);
    }

    syncedMeetings[source.conferenceRecordId] = fingerprint;
  }

  state.syncedMeetings = syncedMeetings;
  state.lastCheckTime = new Date().toISOString();
  saveState(state);

  if (!runContext) {
    console.log("[GoogleMeet] No new or updated meeting transcripts.");
    return;
  }

  const limitedTitles = limitEventItems(changedTitles);
  await serviceLogger.log({
    type: "changes_identified",
    service: runContext.service,
    runId: runContext.runId,
    level: "info",
    message: `Found ${changedTitles.length} meeting transcript source${changedTitles.length === 1 ? "" : "s"} to sync`,
    counts: { meetings: changedTitles.length },
    items: limitedTitles.items,
    truncated: limitedTitles.truncated,
  });
  await serviceLogger.log({
    type: "run_complete",
    service: runContext.service,
    runId: runContext.runId,
    level: "info",
    message: `Google Meet sync complete: ${newCount} new, ${updatedCount} updated`,
    durationMs: Date.now() - runContext.startedAt,
    outcome: newCount > 0 || updatedCount > 0 ? "ok" : "idle",
    summary: { newMeetings: newCount, updatedMeetings: updatedCount },
  });

  if (newCount > 0 || updatedCount > 0) {
    triggerGraphBuilderNow();
  }
}

async function runOnce() {
  if (!composioAccountsRepo.isConnected("googlemeet")) {
    console.log("[GoogleMeet] Google Meet not connected via Composio. Sleeping...");
    return;
  }
  await syncGoogleMeet();
}

export const googleMeetSyncService: BackgroundService = {
  name: "GoogleMeetSync",
  async start() {
    if (isRunning) return;
    isRunning = true;

    console.log("[GoogleMeet] Starting Google Meet Sync Service...");
    console.log(`[GoogleMeet] Will sync every ${SYNC_INTERVAL_MS / 1000} seconds.`);

    if (isRunning) {
      try {
        await runOnce();
      } catch (error) {
        console.error("[GoogleMeet] Error in initial run:", error);
      }
    }

    void (async () => {
      while (isRunning) {
        await interruptibleSleep(SYNC_INTERVAL_MS);
        if (!isRunning) break;
        try {
          await runOnce();
        } catch (error) {
          console.error("[GoogleMeet] Error in main loop:", error);
        }
      }
    })();
  },
  async stop() {
    isRunning = false;
    if (wakeResolve) {
      wakeResolve();
    }
  },
};

export async function triggerGoogleMeetSyncNow() {
  if (!isRunning) {
    return { success: false as const, error: "GoogleMeetSync is not running." };
  }
  await runOnce();
  triggerSync();
  return { success: true as const };
}
