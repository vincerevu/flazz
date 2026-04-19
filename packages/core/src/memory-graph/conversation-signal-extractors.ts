import crypto from "node:crypto";
import { GraphSignal } from "@flazz/shared/dist/graph-signals.js";
import type { RunMemoryRecord } from "../run-memory/run-memory-types.js";
import { z } from "zod";

type GraphSignalRecord = z.infer<typeof GraphSignal> & { confidence?: number };

const INTERNAL_CONVERSATION_EXCLUDED_AGENTS = new Set([
  "note_creation",
  "labeling_agent",
  "email-draft",
  "meeting-prep",
]);

function buildFingerprint(parts: Array<string | undefined>) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 20);
}

function compactText(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function looksLikePreference(text: string) {
  return /(prefer|ưu tiên|always|must|nên|hãy|please use|for next time|remember this|không dùng|đừng|do not|don't)/i.test(text);
}

function looksLikeCorrection(text: string) {
  return /(không phải|sai rồi|instead|thay vào đó|not that|wrong|use .* instead|đúng là|actually)/i.test(text);
}

function summarize(text: string, max = 220) {
  const compact = compactText(text);
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

export function extractConversationSignalsFromRunMemory(record: RunMemoryRecord): GraphSignalRecord[] {
  if (INTERNAL_CONVERSATION_EXCLUDED_AGENTS.has(record.agentId)) {
    return [];
  }

  const signals: GraphSignalRecord[] = [];
  const occurredAt = record.createdAt;
  const objectId = `run:${record.runId}`;
  const topicRefs = [...record.skillRefs.slice(0, 4), ...record.toolRefs.slice(0, 4)];

  const primaryText = compactText(record.firstUserMessage);
  if (primaryText && looksLikePreference(primaryText)) {
    signals.push(
      GraphSignal.parse({
        id: `conversation-preference-${record.id}`,
        source: "conversation",
        kind: "preference",
        objectId,
        objectType: "conversation",
        title: "User preference captured",
        summary: summarize(primaryText),
        occurredAt,
        confidence: 0.76,
        entityRefs: record.entityRefs,
        topicRefs,
        projectRefs: record.projectRefs,
        relationRefs: record.skillRefs.map((skill) => `preference:${record.id}->skill:${skill}`),
        metadata: {
          agentId: record.agentId,
          outcome: record.outcome,
        },
        provenance: `run-memory:${record.id}`,
        fingerprint: buildFingerprint(["conversation", "preference", record.id, primaryText]),
      }),
    );
  }

  for (const [index, correction] of record.corrections.entries()) {
    const text = compactText(correction);
    if (!text || !looksLikeCorrection(text)) {
      continue;
    }
    signals.push(
      GraphSignal.parse({
        id: `conversation-correction-${record.id}-${index}`,
        source: "conversation",
        kind: "correction",
        objectId,
        objectType: "conversation",
        title: "User correction captured",
        summary: summarize(text),
        occurredAt,
        confidence: 0.82,
        entityRefs: record.entityRefs,
        topicRefs,
        projectRefs: record.projectRefs,
        relationRefs: record.toolRefs.map((tool) => `correction:${record.id}->tool:${tool}`),
        metadata: {
          agentId: record.agentId,
          outcome: record.outcome,
        },
        provenance: `run-memory:${record.id}`,
        fingerprint: buildFingerprint(["conversation", "correction", record.id, String(index), text]),
      }),
    );
  }

  return signals;
}
