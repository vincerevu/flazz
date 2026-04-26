import fs from "node:fs";
import path from "node:path";
import { classifySourceTags } from "./tag-system.js";

type SummaryNormalized = {
  id?: string;
  threadId?: string;
  title?: string;
  author?: string;
  assignee?: string;
  owner?: string;
  organizer?: string;
  recipients?: string[];
  attendees?: string[];
  labels?: string[];
  timestamp?: string;
  updatedAt?: string;
  startAt?: string;
  endAt?: string;
  snippet?: string;
  preview?: string;
  status?: string;
  project?: string;
  source?: string;
  importance?: boolean;
  isUnread?: boolean;
  hasAttachment?: boolean;
  path?: string;
  mimeType?: string;
  recordType?: string;
  sheetName?: string;
  rowLabel?: string;
};

export type IntegrationSummaryItem = {
  kind?: string;
  title?: string;
  summary?: string;
  normalized?: SummaryNormalized;
  raw?: unknown;
};

function cleanFilename(value: string) {
  return value.replace(/[\\/*?:"<>|]/g, "").trim().slice(0, 100) || "item";
}

function stripPrefixes(value: string) {
  return value
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\((pr|issue)\s*#\d+\)\s*$/gi, "")
    .trim();
}

function summarizeText(value: string | undefined, maxLength = 500) {
  const compact = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!compact) return "";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}…` : compact;
}

function toTitleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function titleFromNormalized(item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  const candidates = [
    item.title,
    normalized.title,
    normalized.project,
    normalized.sheetName,
    normalized.rowLabel,
  ];
  for (const candidate of candidates) {
    const cleaned = stripPrefixes(candidate ?? "");
    if (cleaned) return cleaned;
  }
  if (normalized.author?.includes("@")) {
    return toTitleCase(normalized.author.split("@")[0] ?? "source item");
  }
  return "Source item";
}

function buildObjectKey(app: string, resourceType: string, normalized: SummaryNormalized) {
  const baseId = normalized.threadId ?? normalized.id;
  return baseId ? `${app}:${resourceType}:${baseId}` : null;
}

function buildDate(normalized: SummaryNormalized) {
  const raw = normalized.timestamp ?? normalized.updatedAt ?? normalized.startAt ?? normalized.endAt;
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function syncFolder(app: string) {
  return `${cleanFilename(app.toLowerCase())}_sync`;
}

function sourceFilename(resourceType: string, item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  const objectId = normalized.threadId ?? normalized.id;
  if (objectId) {
    return `${cleanFilename(String(objectId))}.md`;
  }
  if (resourceType === "message" && item.title) {
    return `${cleanFilename(stripPrefixes(item.title))}.md`;
  }
  return `${cleanFilename(titleFromNormalized(item))}.md`;
}

function buildFrontmatter(app: string, resourceType: string, objectKey: string, item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  const tags = classifySourceTags({
    resourceType,
    title: item.title,
    summary: item.summary ?? normalized.preview ?? normalized.snippet,
    normalized: {
      author: normalized.author,
      labels: normalized.labels,
      status: normalized.status,
      importance: normalized.importance,
      isUnread: normalized.isUnread,
      recordType: normalized.recordType,
      project: normalized.project,
    },
  });
  const lines = [
    "---",
    "type: integration-source",
    `app: ${app}`,
    `resourceType: ${resourceType}`,
    `objectKey: ${objectKey}`,
    `title: ${JSON.stringify(titleFromNormalized(item))}`,
    `date: ${buildDate(normalized)}`,
    `source_path: ${JSON.stringify(`${syncFolder(app)}/${sourceFilename(resourceType, item)}`)}`,
  ];

  if (normalized.author) lines.push(`author: ${JSON.stringify(normalized.author)}`);
  if (normalized.status) lines.push(`status: ${JSON.stringify(normalized.status)}`);
  if (normalized.project) lines.push(`project: ${JSON.stringify(normalized.project)}`);
  if ((normalized.labels ?? []).length > 0) {
    lines.push(`labels: [${(normalized.labels ?? []).map((label) => JSON.stringify(label)).join(", ")}]`);
  }
  lines.push(`relationship: [${tags.relationship.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  lines.push(`topic: [${tags.topic.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  lines.push(`filter: [${tags.filter.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  lines.push(`status_tags: [${tags.status.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  lines.push(`source_tags: [${tags.source.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  lines.push("---", "");
  return lines.join("\n");
}

function formatEmailLikeSource(item: IntegrationSummaryItem, objectKey: string) {
  const normalized = item.normalized ?? {};
  const title = titleFromNormalized(item);
  const author = normalized.author ?? "Unknown";
  const date = buildDate(normalized);
  const body = summarizeText(item.summary ?? normalized.preview ?? normalized.snippet, 4000);

  return [
    `# ${title}`,
    "",
    `**Object Key:** ${objectKey}`,
    `**From:** ${author}`,
    `**Date:** ${date}`,
    `**Thread ID:** ${normalized.threadId ?? normalized.id ?? ""}`,
    "",
    "---",
    "",
    body || "No body available.",
    "",
  ].join("\n");
}

function buildBody(app: string, resourceType: string, objectKey: string, item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  if (resourceType === "message") {
    return formatEmailLikeSource(item, objectKey);
  }

  const title = titleFromNormalized(item);
  const summary = summarizeText(item.summary ?? normalized.snippet ?? normalized.preview, 700);
  const details = [
    normalized.author ? `- Author: ${normalized.author}` : null,
    normalized.assignee ? `- Assignee: ${normalized.assignee}` : null,
    normalized.owner ? `- Owner: ${normalized.owner}` : null,
    normalized.organizer ? `- Organizer: ${normalized.organizer}` : null,
    normalized.status ? `- Status: ${normalized.status}` : null,
    normalized.project ? `- Project: ${normalized.project}` : null,
    normalized.path ? `- Path: ${normalized.path}` : null,
    normalized.mimeType ? `- Mime type: ${normalized.mimeType}` : null,
    normalized.recordType ? `- Record type: ${normalized.recordType}` : null,
    normalized.sheetName ? `- Sheet: ${normalized.sheetName}` : null,
    normalized.rowLabel ? `- Row: ${normalized.rowLabel}` : null,
    (normalized.recipients ?? []).length ? `- Recipients: ${(normalized.recipients ?? []).join(", ")}` : null,
    (normalized.attendees ?? []).length ? `- Attendees: ${(normalized.attendees ?? []).join(", ")}` : null,
  ].filter(Boolean) as string[];

  return [
    `# ${title}`,
    "",
    "## Summary",
    summary || "Synced integration item.",
    "",
    "## Metadata",
    `- Object Key: ${objectKey}`,
    `- App: ${app}`,
    `- Resource: ${resourceType}`,
    `- Last synced: ${buildDate(normalized)}`,
    ...details,
    "",
    "## Structured Payload",
    "```json",
    JSON.stringify(item.raw ?? item, null, 2),
    "```",
    "",
  ].join("\n");
}

export class IntegrationSourceMemoryPromoter {
  private readonly rootDir: string;

  constructor(workDir: string) {
    this.rootDir = workDir;
  }

  promote(app: string, resourceType: string, item: IntegrationSummaryItem) {
    const normalized = item.normalized ?? {};
    const objectKey = buildObjectKey(app, resourceType, normalized);
    if (!objectKey) return null;

    const dir = path.join(this.rootDir, syncFolder(app));
    fs.mkdirSync(dir, { recursive: true });

    const existingPath = this.findExistingPath(dir, objectKey);
    const preferredPath = path.join(dir, sourceFilename(resourceType, item));
    const targetPath = existingPath ?? preferredPath;
    const created = !fs.existsSync(targetPath);

    const content = `${buildFrontmatter(app, resourceType, objectKey, item)}${buildBody(app, resourceType, objectKey, item)}`;
    fs.writeFileSync(targetPath, content, "utf8");
    return { path: targetPath, created };
  }

  private findExistingPath(dir: string, objectKey: string) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf8");
      if (content.includes(`objectKey: ${objectKey}`) || content.includes(`- Object Key: ${objectKey}`)) {
        return filePath;
      }
    }
    return null;
  }
}
