import fs from "node:fs";
import path from "node:path";

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
};

type TargetKind = "Projects" | "People" | "Organizations";

const EMAIL_PROVIDER_ROOTS = new Set([
  "gmail",
  "googlemail",
  "outlook",
  "hotmail",
  "live",
  "yahoo",
  "icloud",
  "protonmail",
]);

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "note";
}

function stripPrefixes(value: string) {
  return value
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\((pr|issue)\s*#\d+\)\s*$/gi, "")
    .trim();
}

function compactTitleSlug(title: string | undefined, summary: string | undefined, maxLength = 48) {
  const preferred = stripPrefixes(title ?? "").trim();
  const fallback = (summary ?? "").trim().split(/\s+/).slice(0, 8).join(" ");
  const raw = preferred || fallback || "work item";
  return sanitizePathSegment(raw).slice(0, maxLength) || "work item";
}

function summarizeText(value: string | undefined, maxLength = 320) {
  const compact = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!compact) return "";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}…` : compact;
}

function dedupe(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean))) as string[];
}

function toTitleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizePersonName(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/(no-?reply|notifications?|\[bot\]|mailer-daemon)/i.test(trimmed)) {
    return undefined;
  }
  const angleMatch = trimmed.match(/^([^<]+)<[^>]+>$/);
  if (angleMatch?.[1]) {
    return sanitizePathSegment(angleMatch[1]);
  }
  if (trimmed.includes("@")) {
    const local = trimmed.split("@")[0]?.trim();
    if (!local) return undefined;
    return sanitizePathSegment(toTitleCase(local));
  }
  return sanitizePathSegment(trimmed);
}

function inferProjectRefs(...values: Array<string | undefined>) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  const refs = new Set<string>();
  if (haystack.includes("flazz")) refs.add("flazz");
  if (haystack.includes("planner")) refs.add("planner");
  if (haystack.includes("billing")) refs.add("billing");
  if (haystack.includes("calendar")) refs.add("calendar");
  return Array.from(refs).slice(0, 4);
}

function inferOrganizationRefs(resourceType: string, item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  const refs = new Set<string>();
  const candidates = dedupe([
    normalized.author,
    ...(normalized.recipients ?? []),
    normalized.owner,
    normalized.organizer,
  ]);

  for (const candidate of candidates) {
    const email = candidate.includes("@") ? candidate : null;
    if (!email) continue;
    const domain = email.split("@")[1]?.toLowerCase();
    const root = domain?.split(".")[0];
    if (!root || EMAIL_PROVIDER_ROOTS.has(root)) continue;
    refs.add(sanitizePathSegment(toTitleCase(root)));
  }

  if (resourceType === "record") {
    const recordType = normalized.recordType?.toLowerCase() ?? "";
    if (/(company|organization|account)/.test(recordType) && item.title) {
      refs.add(sanitizePathSegment(stripPrefixes(item.title)));
    }
  }

  return Array.from(refs).slice(0, 4);
}

function buildObjectKey(app: string, resourceType: string, normalized: SummaryNormalized) {
  const baseId = normalized.threadId ?? normalized.id;
  return baseId ? `${app}:${resourceType}:${baseId}` : null;
}

function buildActivityDate(normalized: SummaryNormalized) {
  const raw = normalized.timestamp ?? normalized.updatedAt ?? normalized.startAt ?? normalized.endAt;
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function summarizeActivity(app: string, resourceType: string, item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  const title = stripPrefixes(item.title ?? normalized.title ?? "Untitled");
  const summary = summarizeText(item.summary ?? normalized.snippet ?? normalized.preview, 220);
  const bits = [title];

  if (resourceType === "ticket") {
    if (normalized.status) bits.push(`status ${normalized.status}`);
    if (normalized.assignee) bits.push(`assignee ${normalizePersonName(normalized.assignee) ?? normalized.assignee}`);
  } else if (resourceType === "message") {
    if (normalized.author) bits.push(`from ${normalizePersonName(normalized.author) ?? normalized.author}`);
  } else if (resourceType === "event") {
    if (normalized.organizer) bits.push(`organized by ${normalizePersonName(normalized.organizer) ?? normalized.organizer}`);
  } else if (resourceType === "record" && normalized.owner) {
    bits.push(`owner ${normalizePersonName(normalized.owner) ?? normalized.owner}`);
  }

  const base = bits.filter(Boolean).join(" — ");
  return summary ? `${base}. ${summary}` : base;
}

function buildEntryBlock(app: string, resourceType: string, objectKey: string, item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  const date = buildActivityDate(normalized);
  const activity = summarizeActivity(app, resourceType, item);
  const summary = summarizeText(item.summary ?? normalized.snippet ?? normalized.preview, 420);
  const contextLines = [
    normalized.status ? `Status: ${normalized.status}` : null,
    normalized.author ? `Author: ${normalized.author}` : null,
    normalized.assignee ? `Assignee: ${normalized.assignee}` : null,
    normalized.owner ? `Owner: ${normalized.owner}` : null,
    normalized.organizer ? `Organizer: ${normalized.organizer}` : null,
  ].filter(Boolean) as string[];

  return [
    `<!-- integration:${objectKey}:start -->`,
    `- **${date}** (${app} ${resourceType}): ${activity}`,
    ...(summary ? [`  Summary: ${summary}`] : []),
    ...(contextLines.length ? [`  Context: ${contextLines.join(" · ")}`] : []),
    `<!-- integration:${objectKey}:end -->`,
  ].join("\n");
}

function ensureSection(content: string, heading: string) {
  if (content.includes(`## ${heading}`)) return content;
  const trimmed = content.trimEnd();
  return `${trimmed}\n\n## ${heading}\n`;
}

function upsertLine(content: string, label: string, value: string) {
  const regex = new RegExp(`^\\*\\*${label}:\\*\\*.*$`, "m");
  const line = `**${label}:** ${value}`;
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  if (content.includes("## Info")) {
    return content.replace("## Info\n", `## Info\n${line}\n`);
  }
  return `${content.trimEnd()}\n\n## Info\n${line}\n`;
}

function upsertActivity(content: string, objectKey: string, entryBlock: string) {
  const startMarker = `<!-- integration:${objectKey}:start -->`;
  const endMarker = `<!-- integration:${objectKey}:end -->`;
  const existingPattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}\\n?`, "g");
  const withoutExisting = content.replace(existingPattern, "").replace(/\n{3,}/g, "\n\n");
  const withSection = ensureSection(withoutExisting, "Activity");
  return withSection.replace("## Activity\n", `## Activity\n${entryBlock}\n`);
}

function buildNewNote(kind: TargetKind, title: string, objectKey: string, app: string, resourceType: string, item: IntegrationSummaryItem) {
  const normalized = item.normalized ?? {};
  const summary = summarizeText(item.summary ?? normalized.snippet ?? normalized.preview, 420);
  const date = buildActivityDate(normalized);
  const entryBlock = buildEntryBlock(app, resourceType, objectKey, item);

  if (kind === "Projects") {
    return [
      `# ${title}`,
      "",
      "## Info",
      `**Type:** ${resourceType}`,
      `**Status:** ${normalized.status ?? ""}`,
      `**Last update:** ${date}`,
      "",
      "## Summary",
      summary || "Tracked project context from synced integrations.",
      "",
      "## Activity",
      entryBlock,
      "",
    ].join("\n");
  }

  if (kind === "People") {
    return [
      `# ${title}`,
      "",
      "## Info",
      `**Role:** ${normalized.recordType ?? ""}`,
      `**Organization:** `,
      `**Email:** ${normalized.author?.includes("@") ? normalized.author : ""}`,
      `**Last update:** ${date}`,
      "",
      "## Summary",
      summary || "Tracked contact context from synced integrations.",
      "",
      "## Activity",
      entryBlock,
      "",
    ].join("\n");
  }

  if (kind === "Organizations") {
    return [
      `# ${title}`,
      "",
      "## Info",
      `**Type:** ${normalized.recordType ?? "organization"}`,
      `**Last update:** ${date}`,
      "",
      "## Summary",
      summary || "Tracked organization context from synced integrations.",
      "",
      "## Activity",
      entryBlock,
      "",
    ].join("\n");
  }

  return [
    `# ${title}`,
    "",
    "## Summary",
    summary || "Tracked integration context.",
    "",
    "## Activity",
    entryBlock,
    "",
  ].join("\n");
}

function chooseTarget(item: IntegrationSummaryItem, resourceType: string): { kind: TargetKind; name: string } | null {
  const normalized = item.normalized ?? {};
  const title = stripPrefixes(item.title ?? normalized.title ?? "Work item");
  const projectRefs = inferProjectRefs(
    normalized.project,
    title,
    item.summary,
    normalized.snippet,
    normalized.preview,
    ...(normalized.labels ?? []),
  );
  if (projectRefs.length > 0) {
    return { kind: "Projects", name: sanitizePathSegment(projectRefs[0]) };
  }

  const people = dedupe([
    normalizePersonName(normalized.author),
    normalizePersonName(normalized.assignee),
    normalizePersonName(normalized.owner),
    normalizePersonName(normalized.organizer),
    ...((normalized.recipients ?? []).map((entry) => normalizePersonName(entry))),
    ...((normalized.attendees ?? []).map((entry) => normalizePersonName(entry))),
  ]);
  if (people.length > 0) {
    return { kind: "People", name: sanitizePathSegment(people[0]) };
  }

  const organizations = inferOrganizationRefs(resourceType, item);
  if (organizations.length > 0) {
    return { kind: "Organizations", name: sanitizePathSegment(organizations[0]) };
  }

  return null;
}

export class IntegrationItemMemoryPromoter {
  private readonly rootDir: string;
  private readonly targetDirs: Record<TargetKind, string>;
  private readonly legacyWorkDir: string;

  constructor(workDir: string) {
    this.rootDir = path.join(workDir, "memory");
    this.targetDirs = {
      Projects: path.join(this.rootDir, "Projects"),
      People: path.join(this.rootDir, "People"),
      Organizations: path.join(this.rootDir, "Organizations"),
    };
    this.legacyWorkDir = path.join(this.rootDir, "Work");
  }

  promote(app: string, resourceType: string, item: IntegrationSummaryItem) {
    const normalized = item.normalized ?? {};
    const objectKey = buildObjectKey(app, resourceType, normalized);
    if (!objectKey) {
      return null;
    }

    const target = chooseTarget(item, resourceType);
    if (!target) {
      return null;
    }
    const targetDir = this.targetDirs[target.kind];
    fs.mkdirSync(targetDir, { recursive: true });

    const canonicalPath = path.join(targetDir, `${target.name}.md`);
    const existingPath = this.findExistingPath(objectKey);
    let finalPath = existingPath ?? canonicalPath;
    if (
      existingPath &&
      existingPath !== canonicalPath &&
      this.shouldMigrateToCanonical(existingPath, target.kind) &&
      !fs.existsSync(canonicalPath)
    ) {
      fs.renameSync(existingPath, canonicalPath);
      finalPath = canonicalPath;
    }
    const created = !fs.existsSync(finalPath);
    const existingContent = created ? "" : fs.readFileSync(finalPath, "utf8");
    const nextContent = created
      ? buildNewNote(target.kind, target.name, objectKey, app, resourceType, item)
      : this.updateExistingNote(existingContent, target.kind, target.name, objectKey, app, resourceType, item);

    fs.writeFileSync(finalPath, nextContent, "utf8");
    return { path: finalPath, created };
  }

  private updateExistingNote(
    content: string,
    kind: TargetKind,
    title: string,
    objectKey: string,
    app: string,
    resourceType: string,
    item: IntegrationSummaryItem,
  ) {
    let next = content.trim() ? content : `# ${title}\n`;
    const date = buildActivityDate(item.normalized ?? {});
    next = upsertLine(next, "Last update", date);
    next = upsertActivity(next, objectKey, buildEntryBlock(app, resourceType, objectKey, item));

    if (kind === "Projects") {
      next = upsertLine(next, "Type", resourceType);
      if (item.normalized?.status) {
        next = upsertLine(next, "Status", item.normalized.status);
      }
    }

    if (kind === "People" && item.normalized?.author?.includes("@")) {
      next = upsertLine(next, "Email", item.normalized.author);
    }

    return `${next.trimEnd()}\n`;
  }

  private shouldMigrateToCanonical(existingPath: string, targetKind: TargetKind) {
    const normalized = existingPath.replace(/\\/g, "/");
    if (normalized.includes("/memory/Knowledge/")) return true;
    if (normalized.includes("/memory/Work/")) return true;
    return false;
  }

  private findExistingPath(objectKey: string) {
    for (const dir of [...Object.values(this.targetDirs), this.legacyWorkDir]) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, "utf8");
        if (content.includes(`integration:${objectKey}:start`) || content.includes(`**Object Key:** ${objectKey}`) || content.includes(`**Thread Key:** ${objectKey}`)) {
          return filePath;
        }
      }
    }
    return null;
  }
}

export { IntegrationItemMemoryPromoter as EmailThreadMemoryPromoter };
