import crypto from "node:crypto";
import { integrationNormalizer } from "../di/container.js";
import type { IntegrationResourceType } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function pickFirst(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toStringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function summarizeText(text: string | undefined, max = 280) {
  if (!text) return undefined;
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

function sliceText(text: string | undefined, size = 500) {
  if (!text) return [];
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const slices: string[] = [];
  for (let index = 0; index < compact.length; index += size) {
    slices.push(compact.slice(index, index + size));
    if (slices.length >= 5) break;
  }
  return slices;
}

function normalizeMessage(app: string, item: unknown) {
  const record = asRecord(item);

  if (app === "gmail" || app === "outlook") {
    return integrationNormalizer.normalizeMessage({
      id: pickFirst(record, ["id", "messageId", "threadId"]) ?? crypto.randomUUID(),
      threadId: pickFirst(record, ["threadId", "conversationId"]),
      title: pickFirst(record, ["subject", "title"]) ?? "Untitled message",
      author: pickFirst(record, ["from", "sender", "author"]),
      timestamp: pickFirst(record, ["internalDate", "date", "createdAt", "timestamp"]),
      snippet: summarizeText(pickFirst(record, ["snippet", "preview", "textBody", "body"])),
      hasAttachment: typeof record.hasAttachment === "boolean" ? record.hasAttachment : undefined,
      source: app,
      estimatedChars: pickFirst(record, ["body", "textBody"])?.length,
    });
  }

  if (app === "slack") {
    return integrationNormalizer.normalizeMessage({
      id: pickFirst(record, ["ts", "id", "threadTs"]) ?? crypto.randomUUID(),
      threadId: pickFirst(record, ["threadTs", "threadId", "conversationId"]),
      title: summarizeText(pickFirst(record, ["text", "title"])) ?? "Slack message",
      author: pickFirst(record, ["user", "username", "author"]),
      timestamp: pickFirst(record, ["ts", "timestamp", "date"]),
      snippet: summarizeText(pickFirst(record, ["text", "snippet", "preview"])),
      source: app,
      estimatedChars: pickFirst(record, ["text"])?.length,
      threadLength: Array.isArray(record.replies) ? record.replies.length : undefined,
    });
  }

  return integrationNormalizer.normalizeMessage({
    id: pickFirst(record, ["id", "messageId", "threadId"]) ?? crypto.randomUUID(),
    threadId: pickFirst(record, ["threadId", "conversationId"]),
    title: pickFirst(record, ["subject", "title", "name"]) ?? "Untitled message",
    author: pickFirst(record, ["from", "sender", "author"]),
    timestamp: pickFirst(record, ["timestamp", "date", "createdAt"]),
    snippet: summarizeText(pickFirst(record, ["snippet", "preview", "text", "body"])),
    source: app,
  });
}

function normalizeDocument(app: string, item: unknown) {
  const record = asRecord(item);

  if (app === "notion") {
    return integrationNormalizer.normalizeDocument({
      id: pickFirst(record, ["id", "pageId"]) ?? crypto.randomUUID(),
      title: pickFirst(record, ["title", "name"]) ?? "Untitled document",
      updatedAt: pickFirst(record, ["lastEditedTime", "updatedAt"]),
      preview: summarizeText(pickFirst(record, ["summary", "text", "preview", "content"])),
      source: app,
      estimatedChars: pickFirst(record, ["content", "text"])?.length,
    });
  }

  return integrationNormalizer.normalizeDocument({
    id: pickFirst(record, ["id", "documentId", "pageId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name"]) ?? "Untitled document",
    updatedAt: pickFirst(record, ["updatedAt", "modifiedTime", "lastEditedTime"]),
    preview: summarizeText(pickFirst(record, ["summary", "text", "preview", "content"])),
    source: app,
    estimatedChars: pickFirst(record, ["content", "text"])?.length,
  });
}

function normalizeTicket(app: string, item: unknown) {
  const record = asRecord(item);

  if (app === "github") {
    const repositoryRecord = asRecord(record.repository);
    const repoRecord = asRecord(record.repo);
    const assigneeRecord = asRecord(record.assignee);
    const authorRecord = asRecord(record.user);
    const repository =
      pickFirst(repositoryRecord, ["full_name", "name"]) ??
      pickFirst(repoRecord, ["full_name", "name"]) ??
      pickFirst(record, ["repositoryName", "repo", "full_name"]);
    const issueOrPullNumber = pickFirst(record, ["number", "issue_number", "pull_number"]);
    const state = pickFirst(record, ["state", "status"]);
    const title = pickFirst(record, ["title", "subject", "summary"]) ?? "Untitled GitHub item";
    const prefix = [repository, issueOrPullNumber ? `#${issueOrPullNumber}` : undefined, state].filter(Boolean).join(" • ");
    return integrationNormalizer.normalizeTicket({
      id: pickFirst(record, ["id", "node_id", "identifier", "number", "issue_number", "pull_number"]) ?? crypto.randomUUID(),
      title,
      status: state,
      assignee:
        pickFirst(assigneeRecord, ["login", "name"]) ??
        pickFirst(authorRecord, ["login", "name"]) ??
        pickFirst(record, ["assignee", "assigneeName", "actor", "author"]),
      updatedAt: pickFirst(record, ["updatedAt", "updated_at", "last_read_at", "created_at"]),
      preview: summarizeText(
        [prefix, pickFirst(record, ["description", "preview", "body", "url", "html_url"])]
          .filter(Boolean)
          .join(" - "),
      ),
      source: app,
      estimatedChars: pickFirst(record, ["description", "body"])?.length,
    });
  }

  return integrationNormalizer.normalizeTicket({
    id: pickFirst(record, ["id", "identifier"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "summary"]) ?? "Untitled ticket",
    status: pickFirst(record, ["status", "state"]),
    assignee: pickFirst(record, ["assignee", "assigneeName"]),
    updatedAt: pickFirst(record, ["updatedAt"]),
    preview: summarizeText(pickFirst(record, ["description", "preview"])),
    source: app,
    estimatedChars: pickFirst(record, ["description", "body"])?.length,
  });
}

function normalizeEvent(app: string, item: unknown) {
  const record = asRecord(item);
  return integrationNormalizer.normalizeEvent({
    id: pickFirst(record, ["id"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "summary"]) ?? "Untitled event",
    startAt: pickFirst(record, ["startAt", "start"]),
    endAt: pickFirst(record, ["endAt", "end"]),
    attendees: toStringArray(record.attendees),
    source: app,
  });
}

function normalizeFile(app: string, item: unknown) {
  const record = asRecord(item);
  return integrationNormalizer.normalizeFile({
    id: pickFirst(record, ["id", "fileId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name"]) ?? "Untitled file",
    path: pickFirst(record, ["path"]),
    mimeType: pickFirst(record, ["mimeType", "mime_type"]),
    preview: summarizeText(pickFirst(record, ["preview", "description"])),
    source: app,
  });
}

function normalizeRecord(app: string, item: unknown) {
  const record = asRecord(item);
  if (app === "linkedin") {
    const localizedName = [
      pickFirst(record, ["localizedFirstName", "firstName", "given_name"]),
      pickFirst(record, ["localizedLastName", "lastName", "family_name"]),
    ].filter(Boolean).join(" ").trim();
    const headline = pickFirst(record, ["headline", "localizedHeadline", "commentary", "description"]);
    const handle = pickFirst(record, ["vanityName", "username"]);
    const companyName = pickFirst(record, ["organizationName", "localizedName", "name"]);
    const title = companyName || localizedName || pickFirst(record, ["title", "displayName", "subject"]) || "LinkedIn record";
    const previewParts = [headline, handle ? `@${handle}` : undefined].filter(Boolean);
    return integrationNormalizer.normalizeRecord({
      id: pickFirst(record, ["id", "author_id", "organization", "urn"]) ?? crypto.randomUUID(),
      title,
      recordType: companyName ? "linkedin_company" : "linkedin_profile",
      owner: localizedName || undefined,
      updatedAt: pickFirst(record, ["lastModifiedAt", "updatedAt"]),
      preview: summarizeText(previewParts.join(" • ")),
      source: app,
      estimatedChars: headline?.length,
    });
  }
  return integrationNormalizer.normalizeRecord({
    id: pickFirst(record, ["id", "recordId", "objectId", "dealId", "contactId", "companyId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name", "displayName", "subject"]) ?? "Untitled record",
    recordType: pickFirst(record, ["recordType", "type", "objectType"]),
    owner: pickFirst(record, ["owner", "ownerName", "assignee"]),
    updatedAt: pickFirst(record, ["updatedAt", "modifiedAt", "lastModifiedAt"]),
    preview: summarizeText(pickFirst(record, ["preview", "description", "notes", "summary"])),
    source: app,
    estimatedChars: pickFirst(record, ["description", "notes", "summary"])?.length,
  });
}

function normalizeCode(app: string, item: unknown) {
  const record = asRecord(item);
  return integrationNormalizer.normalizeCode({
    id: pickFirst(record, ["id", "fileId", "blobId", "path"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name", "path"]) ?? "Untitled code item",
    path: pickFirst(record, ["path", "filePath"]),
    repository: pickFirst(record, ["repository", "repo", "repoName", "project"]),
    preview: summarizeText(pickFirst(record, ["preview", "content", "snippet", "description"])),
    source: app,
    estimatedChars: pickFirst(record, ["content", "snippet"])?.length,
  });
}

function normalizeSpreadsheet(app: string, item: unknown) {
  const record = asRecord(item);
  return integrationNormalizer.normalizeSpreadsheet({
    id: pickFirst(record, ["id", "rowId", "recordId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name", "primaryField", "label"]) ?? "Untitled row",
    sheetName: pickFirst(record, ["sheetName", "tableName", "worksheet", "sheet"]),
    rowLabel: pickFirst(record, ["rowLabel", "primaryField", "label"]),
    preview: summarizeText(pickFirst(record, ["preview", "summary", "content", "values"])),
    source: app,
    estimatedChars: pickFirst(record, ["summary", "content", "values"])?.length,
  });
}

export function normalizeResource(app: string, resourceType: IntegrationResourceType, item: unknown) {
  switch (resourceType) {
    case "message":
      return normalizeMessage(app, item);
    case "document":
      return normalizeDocument(app, item);
    case "ticket":
      return normalizeTicket(app, item);
    case "event":
      return normalizeEvent(app, item);
    case "file":
      return normalizeFile(app, item);
    case "record":
      return normalizeRecord(app, item);
    case "code":
      return normalizeCode(app, item);
    case "spreadsheet":
      return normalizeSpreadsheet(app, item);
    default:
      return null;
  }
}

export function buildStructuredView(app: string, resourceType: IntegrationResourceType, item: unknown) {
  const record = asRecord(item);
  const normalized = normalizeResource(app, resourceType, item);
  const body = pickFirst(record, ["body", "textBody", "text", "content", "description"]);

  switch (resourceType) {
    case "message":
      return {
        kind: "message",
        normalized,
        threadId: pickFirst(record, ["threadId", "threadTs", "conversationId"]),
        recipients: toStringArray(record.to) ?? toStringArray(record.recipients),
        bodyPreview: summarizeText(body, 600),
      };
    case "document":
      return {
        kind: "document",
        normalized,
        bodyPreview: summarizeText(body, 800),
        headings: toStringArray(record.headings),
      };
    case "ticket":
      return {
        kind: "ticket",
        normalized,
        labels: toStringArray(record.labels),
        repository: pickFirst(record, ["repository", "repositoryName", "repo", "full_name"]),
        reason: pickFirst(record, ["reason", "notificationReason"]),
        bodyPreview: summarizeText(body, 800),
      };
    case "event":
      return {
        kind: "event",
        normalized,
        location: pickFirst(record, ["location"]),
        notesPreview: summarizeText(body, 600),
      };
    case "file":
      return {
        kind: "file",
        normalized,
        fileSize: record.size,
        preview: summarizeText(pickFirst(record, ["preview", "description", "text"]), 600),
      };
    case "record":
      return {
        kind: "record",
        normalized,
        owner: pickFirst(record, ["owner", "ownerName", "assignee"]),
        recordType: pickFirst(record, ["recordType", "type", "objectType"]),
        authorId: pickFirst(record, ["author_id"]),
        companyUrn: pickFirst(record, ["organization", "urn"]),
        bodyPreview: summarizeText(body || pickFirst(record, ["summary", "notes"]), 800),
      };
    case "code":
      return {
        kind: "code",
        normalized,
        repository: pickFirst(record, ["repository", "repo", "repoName", "project"]),
        path: pickFirst(record, ["path", "filePath"]),
        bodyPreview: summarizeText(body || pickFirst(record, ["snippet", "preview"]), 800),
      };
    case "spreadsheet":
      return {
        kind: "spreadsheet",
        normalized,
        sheetName: pickFirst(record, ["sheetName", "tableName", "worksheet", "sheet"]),
        rowLabel: pickFirst(record, ["rowLabel", "primaryField", "label"]),
        bodyPreview: summarizeText(body || pickFirst(record, ["summary", "values"]), 800),
      };
    default:
      return {
        kind: resourceType,
        normalized,
      };
  }
}

export function buildSummaryView(app: string, resourceType: IntegrationResourceType, item: unknown) {
  const structured = buildStructuredView(app, resourceType, item) as Record<string, unknown>;
  const normalized = structured.normalized as Record<string, unknown> | undefined;
  const title = typeof normalized?.title === "string" ? normalized.title : "Untitled";
  const preview =
    (typeof structured.bodyPreview === "string" && structured.bodyPreview) ||
    (typeof structured.preview === "string" && structured.preview) ||
    (typeof structured.notesPreview === "string" && structured.notesPreview) ||
    (typeof normalized?.snippet === "string" && normalized.snippet) ||
    (typeof normalized?.preview === "string" && normalized.preview) ||
    "";

  return {
    kind: resourceType,
    title,
    summary: summarizeText(preview, 320) ?? "",
    normalized,
  };
}

export function buildSlicesView(app: string, resourceType: IntegrationResourceType, item: unknown) {
  const record = asRecord(item);
  const body = pickFirst(record, ["body", "textBody", "text", "content", "description"]);
  return {
    kind: resourceType,
    normalized: normalizeResource(app, resourceType, item),
    slices: sliceText(body, 500),
  };
}
