import crypto from "node:crypto";
import { GraphSignal } from "@flazz/shared/dist/graph-signals.js";
import { DocumentItem, EventItem, FileItem, IntegrationResourceType as IntegrationResourceTypeSchema, MessageItem, RecordItem, SpreadsheetItem, TicketItem } from "@flazz/shared/dist/integration-resources.js";
import { z } from "zod";

type IntegrationResourceType = z.infer<typeof IntegrationResourceTypeSchema>;
type GraphSignalRecord = z.infer<typeof GraphSignal> & { confidence?: number };
type TicketSignalItem = z.infer<typeof TicketItem> & { project?: string; url?: string };
type EventSignalItem = z.infer<typeof EventItem> & { organizer?: string; project?: string };
type DocumentSignalItem = z.infer<typeof DocumentItem> & { owner?: string; url?: string };
type MessageSignalItem = z.infer<typeof MessageItem> & { recipients?: string[]; labels?: string[]; importance?: boolean; isUnread?: boolean };
type RecordSignalItem = z.infer<typeof RecordItem>;
type FileSignalItem = z.infer<typeof FileItem>;
type SpreadsheetSignalItem = z.infer<typeof SpreadsheetItem>;

function sanitizeRef(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function dedupe(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => sanitizeRef(value)).filter(Boolean))) as string[];
}

function buildFingerprint(parts: Array<string | undefined>) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 20);
}

function isoNowFallback(value?: string) {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function compactText(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function inferDocumentProjectRefs(app: string, document: DocumentSignalItem) {
  const haystack = compactText(document.title, document.preview, document.url);
  const refs = new Set<string>();

  if (haystack.includes("flazz")) refs.add("flazz");
  if (haystack.includes("planner")) refs.add("planner");
  if (haystack.includes("billing")) refs.add("billing");
  if (app === "notion" && haystack.includes("workspace")) refs.add("workspace");

  return Array.from(refs).slice(0, 4);
}

function looksLikeDecisionDocument(document: DocumentSignalItem) {
  const haystack = compactText(document.title, document.preview);
  return /(decision|adr|approved|proposal|choose|chosen|decide|plan|rollout)/.test(haystack);
}

function inferMessageProjectRefs(message: MessageSignalItem) {
  const haystack = compactText(message.title, message.snippet, ...(message.labels ?? []));
  const refs = new Set<string>();
  if (haystack.includes("flazz")) refs.add("flazz");
  if (haystack.includes("planner")) refs.add("planner");
  if (haystack.includes("billing")) refs.add("billing");
  if (haystack.includes("calendar")) refs.add("calendar");
  return Array.from(refs).slice(0, 4);
}

function looksLikeNoiseMessage(message: MessageSignalItem) {
  const author = sanitizeRef(message.author)?.toLowerCase() ?? "";
  const haystack = compactText(message.title, message.snippet, ...(message.labels ?? []), author);
  return /(unsubscribe|newsletter|digest|sale|discount|coupon|is hiring|share their thoughts|liked your post|available in public preview|out now|get my recent courses|invoice is available|new invitation)/.test(haystack)
    || /(no-?reply|do-?not-?reply|newsletter|mailer-daemon|notifications?)/.test(author);
}

function inferGenericProjectRefs(...values: Array<string | undefined>) {
  const haystack = compactText(...values);
  const refs = new Set<string>();
  if (haystack.includes("flazz")) refs.add("flazz");
  if (haystack.includes("planner")) refs.add("planner");
  if (haystack.includes("billing")) refs.add("billing");
  if (haystack.includes("calendar")) refs.add("calendar");
  return Array.from(refs).slice(0, 4);
}

function isHighSignalEmail(message: MessageSignalItem, projectRefs: string[]) {
  if (looksLikeNoiseMessage(message)) {
    return false;
  }
  const labels = (message.labels ?? []).join(" ").toLowerCase();
  const haystack = compactText(message.title, message.snippet, message.author, ...projectRefs);
  return Boolean(
    message.importance ||
    message.hasAttachment ||
    (message.threadLength ?? 0) >= 2 ||
    message.isUnread ||
    /important|starred|priority|flagged/.test(labels) ||
    projectRefs.length > 0 ||
    /(security|token|password|credential|access|github|pull request|review requested|action required|deadline|approved|decision|meeting)/.test(haystack)
  );
}

function looksLikeActionEmail(message: MessageSignalItem) {
  const haystack = compactText(message.title, message.snippet);
  return /(action|required|follow up|follow-up|todo|to do|next step|deadline|due|review|respond|reply)/.test(haystack);
}

function looksLikeDecisionEmail(message: MessageSignalItem) {
  const haystack = compactText(message.title, message.snippet);
  return /(decision|approved|proposal|plan|rollout|choose|chosen|schedule)/.test(haystack);
}

function extractTicketSignals(app: "github" | "jira" | "linear", ticket: TicketSignalItem): GraphSignalRecord[] {
  const objectId = `${app}:${ticket.id}`;
  const occurredAt = isoNowFallback(ticket.updatedAt);
  const entityRefs = dedupe([ticket.assignee]);
  const projectRefs = dedupe([ticket.project]);
  const topicRefs = dedupe([ticket.project, ticket.status]);

  const baseSignal = {
    source: app,
    objectId,
    objectType: "ticket",
    title: ticket.title,
    summary: ticket.preview,
    occurredAt,
    entityRefs,
    topicRefs,
    projectRefs,
    provenance: `normalized:${app}:${ticket.id}`,
  } as const;

  const signals = [];

  if (ticket.assignee) {
    signals.push(
      GraphSignal.parse({
        ...baseSignal,
        id: `${app}-assignment-${ticket.id}`,
        kind: "assignment",
        confidence: app === "github" ? 0.97 : 0.94,
        relationRefs: [
          ...entityRefs.map((entry) => `person:${entry}->ticket:${ticket.id}`),
          ...projectRefs.map((project) => `ticket:${ticket.id}->project:${project}`),
        ],
        metadata: {
          status: ticket.status ?? "unknown",
          project: ticket.project ?? "",
          source: ticket.source,
        },
        fingerprint: buildFingerprint([app, "assignment", ticket.id, ticket.assignee, ticket.status, ticket.project]),
      }),
    );
  }

  if (ticket.status) {
    signals.push(
      GraphSignal.parse({
        ...baseSignal,
        id: `${app}-status-${ticket.id}`,
        kind: "status-change",
        confidence: app === "github" ? 0.94 : 0.91,
        relationRefs: [
          `ticket:${ticket.id}->status:${ticket.status}`,
          ...projectRefs.map((project) => `ticket:${ticket.id}->project:${project}`),
        ],
        metadata: {
          status: ticket.status,
          project: ticket.project ?? "",
          source: ticket.source,
        },
        fingerprint: buildFingerprint([app, "status-change", ticket.id, ticket.status, ticket.project]),
      }),
    );
  }

  return signals;
}

function extractEventSignals(app: "googlecalendar", event: EventSignalItem): GraphSignalRecord[] {
  const attendees = dedupe(event.attendees ?? []);
  const entityRefs = dedupe([...attendees, event.organizer]);
  const projectRefs = dedupe([event.project]);
  const objectId = `${app}:${event.id}`;
  const occurredAt = isoNowFallback(event.startAt ?? event.endAt);

  return [
    GraphSignal.parse({
      id: `calendar-meeting-${event.id}`,
      source: "googlecalendar",
      kind: "meeting",
      objectId,
      objectType: "event",
      title: event.title,
      summary: event.title,
      occurredAt,
      confidence: 0.9,
      entityRefs,
      topicRefs: dedupe([event.project]),
      projectRefs,
      relationRefs: [
        ...attendees.map((entry) => `meeting:${event.id}->attendee:${entry}`),
        ...(event.organizer ? [`meeting:${event.id}->organizer:${event.organizer}`] : []),
        ...projectRefs.map((project) => `meeting:${event.id}->project:${project}`),
      ],
      metadata: {
        attendeeCount: attendees.length,
        organizer: event.organizer ?? "",
        project: event.project ?? "",
        startAt: event.startAt ?? "",
        endAt: event.endAt ?? "",
      },
      provenance: `normalized:${app}:${event.id}`,
      fingerprint: buildFingerprint([app, "meeting", event.id, event.startAt, event.organizer, event.project, ...attendees]),
    }),
  ];
}

function extractDocumentSignals(app: "notion" | "googledocs" | "confluence", document: DocumentSignalItem): GraphSignalRecord[] {
  const occurredAt = isoNowFallback(document.updatedAt);
  const objectId = `${app}:${document.id}`;
  const entityRefs = dedupe([document.owner]);
  const projectRefs = inferDocumentProjectRefs(app, document);
  const topicRefs = dedupe(projectRefs);
  const signals: GraphSignalRecord[] = [];

  if (projectRefs.length > 0) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-project-link-${document.id}`,
        source: "document",
        kind: "project-link",
        objectId,
        objectType: "document",
        title: document.title,
        summary: document.preview,
        occurredAt,
        confidence: 0.72,
        entityRefs,
        topicRefs,
        projectRefs,
        relationRefs: projectRefs.map((project) => `document:${document.id}->project:${project}`),
        metadata: {
          app,
          owner: document.owner ?? "",
          url: document.url ?? "",
        },
        provenance: `normalized:${app}:${document.id}`,
        fingerprint: buildFingerprint([app, "project-link", document.id, ...projectRefs]),
      }),
    );
  }

  if (looksLikeDecisionDocument(document)) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-decision-candidate-${document.id}`,
        source: "document",
        kind: "decision-candidate",
        objectId,
        objectType: "document",
        title: document.title,
        summary: document.preview,
        occurredAt,
        confidence: 0.78,
        entityRefs,
        topicRefs,
        projectRefs,
        relationRefs: projectRefs.map((project) => `decision:${document.id}->project:${project}`),
        metadata: {
          app,
          owner: document.owner ?? "",
          url: document.url ?? "",
        },
        provenance: `normalized:${app}:${document.id}`,
        fingerprint: buildFingerprint([app, "decision-candidate", document.id, document.title, document.updatedAt]),
      }),
    );
  }

  return signals;
}

function extractEmailSignals(app: "gmail" | "outlook", message: MessageSignalItem): GraphSignalRecord[] {
  const occurredAt = isoNowFallback(message.timestamp);
  const objectId = `${app}:${message.threadId || message.id}`;
  const entityRefs = dedupe([message.author, ...(message.recipients ?? [])]);
  const projectRefs = inferMessageProjectRefs(message);
  const topicRefs = dedupe(projectRefs);
  if (!isHighSignalEmail(message, projectRefs)) {
    return [];
  }

  const signals: GraphSignalRecord[] = [];
  if (projectRefs.length > 0) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-project-link-${message.id}`,
        source: "email",
        kind: "project-link",
        objectId,
        objectType: "thread",
        title: message.title,
        summary: message.snippet,
        occurredAt,
        confidence: 0.69,
        entityRefs,
        topicRefs,
        projectRefs,
        relationRefs: projectRefs.map((project) => `thread:${message.threadId || message.id}->project:${project}`),
        metadata: {
          app,
          author: message.author ?? "",
          unread: message.isUnread ?? false,
        },
        provenance: `normalized:${app}:${message.id}`,
        fingerprint: buildFingerprint([app, "project-link", message.id, ...projectRefs]),
      }),
    );
  }

  if (looksLikeActionEmail(message)) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-action-item-${message.id}`,
        source: "email",
        kind: "action-item-candidate",
        objectId,
        objectType: "thread",
        title: message.title,
        summary: message.snippet,
        occurredAt,
        confidence: 0.74,
        entityRefs,
        topicRefs,
        projectRefs,
        relationRefs: entityRefs.map((entity) => `thread:${message.threadId || message.id}->person:${entity}`),
        metadata: {
          app,
          author: message.author ?? "",
          unread: message.isUnread ?? false,
        },
        provenance: `normalized:${app}:${message.id}`,
        fingerprint: buildFingerprint([app, "action-item-candidate", message.id, message.title, message.snippet]),
      }),
    );
  }

  if (looksLikeDecisionEmail(message)) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-decision-candidate-${message.id}`,
        source: "email",
        kind: "decision-candidate",
        objectId,
        objectType: "thread",
        title: message.title,
        summary: message.snippet,
        occurredAt,
        confidence: 0.71,
        entityRefs,
        topicRefs,
        projectRefs,
        relationRefs: projectRefs.map((project) => `decision:${message.id}->project:${project}`),
        metadata: {
          app,
          author: message.author ?? "",
        },
        provenance: `normalized:${app}:${message.id}`,
        fingerprint: buildFingerprint([app, "email-decision-candidate", message.id, message.title]),
      }),
    );
  }

  return signals;
}

function extractRecordSignals(app: "linkedin" | "hubspot" | "salesforce" | "pipedrive", record: RecordSignalItem): GraphSignalRecord[] {
  const occurredAt = isoNowFallback(record.updatedAt);
  const objectId = `${app}:${record.id}`;
  const entityRefs = dedupe([record.owner]);
  const projectRefs = inferGenericProjectRefs(record.title, record.preview, record.recordType);
  const topicRefs = dedupe([record.recordType, ...projectRefs]);
  const signals: GraphSignalRecord[] = [];

  if (projectRefs.length > 0) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-project-link-${record.id}`,
        source: "record",
        kind: "project-link",
        objectId,
        objectType: "record",
        title: record.title,
        summary: record.preview,
        occurredAt,
        confidence: app === "linkedin" ? 0.66 : 0.7,
        entityRefs,
        topicRefs,
        projectRefs,
        relationRefs: projectRefs.map((project) => `record:${record.id}->project:${project}`),
        metadata: {
          app,
          recordType: record.recordType ?? "",
          owner: record.owner ?? "",
        },
        provenance: `normalized:${app}:${record.id}`,
        fingerprint: buildFingerprint([app, "record-project-link", record.id, ...projectRefs]),
      }),
    );
  }

  if (/follow up|reply|review|call|meeting|deadline|connect/.test(compactText(record.title, record.preview))) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-action-item-${record.id}`,
        source: "record",
        kind: "action-item-candidate",
        objectId,
        objectType: "record",
        title: record.title,
        summary: record.preview,
        occurredAt,
        confidence: 0.65,
        entityRefs,
        topicRefs,
        projectRefs,
        relationRefs: entityRefs.map((entity) => `record:${record.id}->person:${entity}`),
        metadata: {
          app,
          recordType: record.recordType ?? "",
        },
        provenance: `normalized:${app}:${record.id}`,
        fingerprint: buildFingerprint([app, "record-action-item", record.id, record.title, record.preview]),
      }),
    );
  }

  return signals;
}

function extractFileSignals(app: "googledrive" | "dropbox" | "box", file: FileSignalItem): GraphSignalRecord[] {
  const projectRefs = inferGenericProjectRefs(file.title, file.preview, file.path);
  if (projectRefs.length === 0) {
    return [];
  }
  return [
    GraphSignal.parse({
      id: `${app}-project-link-${file.id}`,
      source: "file",
      kind: "project-link",
      objectId: `${app}:${file.id}`,
      objectType: "file",
      title: file.title,
      summary: file.preview,
      occurredAt: new Date().toISOString(),
      confidence: 0.62,
      entityRefs: [],
      topicRefs: dedupe(projectRefs),
      projectRefs,
      relationRefs: projectRefs.map((project) => `file:${file.id}->project:${project}`),
      metadata: {
        app,
        path: file.path ?? "",
        mimeType: file.mimeType ?? "",
      },
      provenance: `normalized:${app}:${file.id}`,
      fingerprint: buildFingerprint([app, "file-project-link", file.id, ...projectRefs]),
    }),
  ];
}

function extractSpreadsheetSignals(app: "googlesheets" | "airtable", sheet: SpreadsheetSignalItem): GraphSignalRecord[] {
  const occurredAt = new Date().toISOString();
  const projectRefs = inferGenericProjectRefs(sheet.title, sheet.preview, sheet.sheetName, sheet.rowLabel);
  const signals: GraphSignalRecord[] = [];

  if (projectRefs.length > 0) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-project-link-${sheet.id}`,
        source: "spreadsheet",
        kind: "project-link",
        objectId: `${app}:${sheet.id}`,
        objectType: "spreadsheet",
        title: sheet.title,
        summary: sheet.preview,
        occurredAt,
        confidence: 0.67,
        entityRefs: [],
        topicRefs: dedupe(projectRefs),
        projectRefs,
        relationRefs: projectRefs.map((project) => `spreadsheet:${sheet.id}->project:${project}`),
        metadata: {
          app,
          sheetName: sheet.sheetName ?? "",
          rowLabel: sheet.rowLabel ?? "",
        },
        provenance: `normalized:${app}:${sheet.id}`,
        fingerprint: buildFingerprint([app, "spreadsheet-project-link", sheet.id, ...projectRefs]),
      }),
    );
  }

  if (/decision|approved|plan|rollout|roadmap|priority/.test(compactText(sheet.title, sheet.preview, sheet.rowLabel))) {
    signals.push(
      GraphSignal.parse({
        id: `${app}-decision-candidate-${sheet.id}`,
        source: "spreadsheet",
        kind: "decision-candidate",
        objectId: `${app}:${sheet.id}`,
        objectType: "spreadsheet",
        title: sheet.title,
        summary: sheet.preview,
        occurredAt,
        confidence: 0.68,
        entityRefs: [],
        topicRefs: dedupe(projectRefs),
        projectRefs,
        relationRefs: projectRefs.map((project) => `decision:${sheet.id}->project:${project}`),
        metadata: {
          app,
          sheetName: sheet.sheetName ?? "",
        },
        provenance: `normalized:${app}:${sheet.id}`,
        fingerprint: buildFingerprint([app, "spreadsheet-decision", sheet.id, sheet.title, sheet.preview]),
      }),
    );
  }

  return signals;
}

export function extractGraphSignalsFromNormalized(
  app: string,
  resourceType: IntegrationResourceType,
  item: unknown
): GraphSignalRecord[] {
  if (resourceType === "ticket" && (app === "github" || app === "jira" || app === "linear")) {
    return extractTicketSignals(app, TicketItem.parse(item));
  }

  if (resourceType === "event" && app === "googlecalendar") {
    return extractEventSignals(app, EventItem.parse(item));
  }

  if (resourceType === "document" && (app === "notion" || app === "googledocs" || app === "confluence")) {
    return extractDocumentSignals(app, DocumentItem.parse(item) as DocumentSignalItem);
  }

  if (resourceType === "message" && (app === "gmail" || app === "outlook")) {
    return extractEmailSignals(app, MessageItem.parse(item) as MessageSignalItem);
  }

  if (resourceType === "record" && (app === "linkedin" || app === "hubspot" || app === "salesforce" || app === "pipedrive")) {
    return extractRecordSignals(app, RecordItem.parse(item));
  }

  if (resourceType === "file" && (app === "googledrive" || app === "dropbox" || app === "box")) {
    return extractFileSignals(app, FileItem.parse(item));
  }

  if (resourceType === "spreadsheet" && (app === "googlesheets" || app === "airtable")) {
    return extractSpreadsheetSignals(app, SpreadsheetItem.parse(item));
  }

  return [];
}
