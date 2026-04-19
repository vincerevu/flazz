import fs from "node:fs";
import path from "node:path";
import { GraphSignal as GraphSignalSchema } from "@flazz/shared/dist/graph-signals.js";
import { z } from "zod";

type GraphSignal = z.infer<typeof GraphSignalSchema>;
type GraphSignalRecord = GraphSignal & { confidence?: number };

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "unknown";
}

function compactTitleSlug(value: string | undefined, maxLength = 48) {
  return sanitizePathSegment(value ?? "note").slice(0, maxLength) || "note";
}

function makeUniqueSlug(base: string, taken: Set<string>) {
  let candidate = base;
  let index = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  taken.add(candidate);
  return candidate;
}

function formatList(items: string[]): string {
  return items.length ? items.join(", ") : "-";
}

function formatWikiList(items: string[]): string {
  return items.length ? items.join(", ") : "_None_";
}

function toKnowledgeWikiLink(...segments: string[]) {
  return `[[${segments.map((segment) => sanitizePathSegment(segment)).join("/")}]]`;
}

function buildWorkNoteSlugFromSignals(signals: GraphSignalRecord[]) {
  const latest = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return compactTitleSlug(latest?.title ?? "work");
}

function toKnowledgeWorkWikiLink(signals: GraphSignalRecord[]) {
  return toKnowledgeWikiLink("Work", buildWorkNoteSlugFromSignals(signals));
}

function buildSignalNote(signal: GraphSignalRecord): string {
  return [
    `# ${signal.title}`,
    "",
    `**Type:** Graph Signal`,
    `**Source:** ${signal.source}`,
    `**Kind:** ${signal.kind}`,
    `**Object ID:** ${signal.objectId}`,
    `**Object Type:** ${signal.objectType}`,
    `**Occurred:** ${signal.occurredAt}`,
    `**Confidence:** ${signal.confidence ?? "-"}`,
    `**Provenance:** ${signal.provenance}`,
    `**Entities:** ${formatList(signal.entityRefs)}`,
    `**Topics:** ${formatList(signal.topicRefs)}`,
    `**Projects:** ${formatList(signal.projectRefs)}`,
    `**Relations:** ${formatList(signal.relationRefs)}`,
    "",
    "## Summary",
    "",
    signal.summary || "_No summary_",
    "",
    "## Metadata",
    "",
    ...Object.entries(signal.metadata).map(([key, value]) => `- ${key}: ${String(value)}`),
  ].join("\n");
}

function buildEntityAggregateNote(entity: string, signals: GraphSignalRecord[]): string {
  const latest = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const projects = Array.from(new Set(signals.flatMap((signal) => signal.projectRefs))).slice(0, 12);
  const kinds = Array.from(new Set(signals.map((signal) => signal.kind))).slice(0, 12);
  return [
    `# ${entity}`,
    "",
    `**Type:** Person Aggregate`,
    `**Source:** Graph Signals`,
    `**Provenance:** signal-entity:${entity}`,
    `**Occurrences:** ${signals.length}`,
    `**Kinds:** ${formatList(kinds)}`,
    `**Projects:** ${formatList(projects)}`,
    `**Last Seen:** ${latest?.occurredAt || "-"}`,
    "",
    "## Recent Signals",
    "",
    ...signals
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10)
      .map((signal) => `- ${signal.occurredAt}: [${signal.source}/${signal.kind}] ${signal.title}`),
  ].join("\n");
}

function buildProjectAggregateNote(project: string, signals: GraphSignalRecord[]): string {
  const latest = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const entities = Array.from(new Set(signals.flatMap((signal) => signal.entityRefs))).slice(0, 12);
  const kinds = Array.from(new Set(signals.map((signal) => signal.kind))).slice(0, 12);
  return [
    `# ${project}`,
    "",
    `**Type:** Project Aggregate`,
    `**Source:** Graph Signals`,
    `**Provenance:** signal-project:${project}`,
    `**Occurrences:** ${signals.length}`,
    `**Kinds:** ${formatList(kinds)}`,
    `**Entities:** ${formatList(entities)}`,
    `**Last Seen:** ${latest?.occurredAt || "-"}`,
    "",
    "## Recent Signals",
    "",
    ...signals
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10)
      .map((signal) => `- ${signal.occurredAt}: [${signal.source}/${signal.kind}] ${signal.title}`),
  ].join("\n");
}

function buildWorkAggregateNote(objectId: string, objectType: string, signals: GraphSignalRecord[]): string {
  const latest = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const kinds = Array.from(new Set(signals.map((signal) => signal.kind))).slice(0, 12);
  const entities = Array.from(new Set(signals.flatMap((signal) => signal.entityRefs))).slice(0, 12);
  const projects = Array.from(new Set(signals.flatMap((signal) => signal.projectRefs))).slice(0, 12);
  return [
    `# ${latest?.title || objectId}`,
    "",
    `**Type:** Work Aggregate`,
    `**Source:** Graph Signals`,
    `**Provenance:** signal-work:${objectId}`,
    `**Object ID:** ${objectId}`,
    `**Object Type:** ${objectType}`,
    `**Occurrences:** ${signals.length}`,
    `**Kinds:** ${formatList(kinds)}`,
    `**Entities:** ${formatList(entities)}`,
    `**Projects:** ${formatList(projects)}`,
    `**Last Seen:** ${latest?.occurredAt || "-"}`,
    "",
    "## Recent Signals",
    "",
    ...signals
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10)
      .map((signal) => `- ${signal.occurredAt}: [${signal.source}/${signal.kind}] ${signal.title}`),
  ].join("\n");
}

function buildKnowledgePersonNote(entity: string, signals: GraphSignalRecord[]): string {
  const latest = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const projects = Array.from(new Set(signals.flatMap((signal) => signal.projectRefs))).slice(0, 12);
  const workLinks = Array.from(
    new Set(
      signals
        .filter((signal) => shouldPromoteKnowledgeWork(allSignalsForObject(signals, signal.objectId)))
        .map((signal) => toKnowledgeWorkWikiLink(allSignalsForObject(signals, signal.objectId))),
    ),
  ).slice(0, 12);

  return [
    `# ${entity}`,
    "",
    `**Type:** Knowledge Person`,
    `**Source:** Graph Signals`,
    `**Occurrences:** ${signals.length}`,
    `**Last Seen:** ${latest?.occurredAt || "-"}`,
    "",
    "## Projects",
    "",
    formatWikiList(projects.map((project) => toKnowledgeWikiLink("Projects", project))),
    "",
    "## Related Work",
    "",
    formatWikiList(workLinks),
    "",
    "## Recent Signals",
    "",
    ...signals
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10)
      .map((signal) => `- ${signal.occurredAt}: [${signal.source}/${signal.kind}] ${signal.title}`),
  ].join("\n");
}

function buildKnowledgeProjectNote(project: string, signals: GraphSignalRecord[]): string {
  const latest = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const workLinks = Array.from(
    new Set(
      signals
        .filter((signal) => shouldPromoteKnowledgeWork(allSignalsForObject(signals, signal.objectId)))
        .map((signal) => toKnowledgeWorkWikiLink(allSignalsForObject(signals, signal.objectId))),
    ),
  ).slice(0, 12);
  const peopleLinks = Array.from(
    new Set(
      signals
        .flatMap((signal) => signal.entityRefs)
        .filter((entity) => shouldPromoteKnowledgePerson(entity, signals)),
    ),
  )
    .slice(0, 12)
    .map((entity) => toKnowledgeWikiLink("People", entity));

  return [
    `# ${project}`,
    "",
    `**Type:** Knowledge Project`,
    `**Source:** Graph Signals`,
    `**Occurrences:** ${signals.length}`,
    `**Last Seen:** ${latest?.occurredAt || "-"}`,
    "",
    "## Related Work",
    "",
    formatWikiList(workLinks),
    "",
    "## People",
    "",
    formatWikiList(peopleLinks),
    "",
    "## Recent Signals",
    "",
    ...signals
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10)
      .map((signal) => `- ${signal.occurredAt}: [${signal.source}/${signal.kind}] ${signal.title}`),
  ].join("\n");
}

function buildKnowledgeWorkNote(objectId: string, objectType: string, signals: GraphSignalRecord[]): string {
  const latest = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const projects = Array.from(new Set(signals.flatMap((signal) => signal.projectRefs))).slice(0, 12);
  const people = Array.from(
    new Set(signals.flatMap((signal) => signal.entityRefs).filter((entity) => shouldPromoteKnowledgePerson(entity, signals))),
  ).slice(0, 12);

  return [
    `# ${latest?.title || objectId}`,
    "",
    `**Type:** Knowledge Work`,
    `**Source:** Graph Signals`,
    `**Object ID:** ${objectId}`,
    `**Object Type:** ${objectType}`,
    `**Occurrences:** ${signals.length}`,
    `**Last Seen:** ${latest?.occurredAt || "-"}`,
    "",
    "## Projects",
    "",
    formatWikiList(projects.map((project) => toKnowledgeWikiLink("Projects", project))),
    "",
    "## People",
    "",
    formatWikiList(people.map((entity) => toKnowledgeWikiLink("People", entity))),
    "",
    "## Recent Signals",
    "",
    ...signals
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10)
      .map((signal) => `- ${signal.occurredAt}: [${signal.source}/${signal.kind}] ${signal.title}`),
  ].join("\n");
}

function allSignalsForObject(signals: GraphSignalRecord[], objectId: string) {
  return signals.filter((entry) => entry.objectId === objectId);
}

function shouldPromoteKnowledgePerson(entity: string, signals: GraphSignalRecord[]) {
  if (!entity || entity.includes("@")) return false;
  const related = signals.filter((signal) => signal.entityRefs.includes(entity));
  return related.length >= 2;
}

function shouldPromoteKnowledgeWork(signals: GraphSignalRecord[]) {
  if (signals.length >= 2) return true;
  return signals.some((signal) => signal.kind !== "meeting");
}

export class GraphSignalPromoter {
  private readonly signalsDir: string;
  private readonly peopleDir: string;
  private readonly projectsDir: string;
  private readonly workDir: string;
  private readonly reviewDir: string;
  private readonly knowledgePeopleDir: string;
  private readonly knowledgeProjectsDir: string;
  private readonly knowledgeWorkDir: string;

  constructor(workDir: string) {
    this.signalsDir = path.join(workDir, "memory", "Signals");
    this.peopleDir = path.join(this.signalsDir, "People");
    this.projectsDir = path.join(this.signalsDir, "Projects");
    this.workDir = path.join(this.signalsDir, "Work");
    this.reviewDir = path.join(this.signalsDir, "Reviews");
    this.knowledgePeopleDir = path.join(workDir, "memory", "People");
    this.knowledgeProjectsDir = path.join(workDir, "memory", "Projects");
    this.knowledgeWorkDir = path.join(workDir, "memory", "Work");
  }

  promote(signal: GraphSignalRecord, allSignals: GraphSignalRecord[] = [signal]): { path: string; created: boolean; aggregatePaths: string[] } {
    const targetPath = this.getNotePath(signal);
    const created = !fs.existsSync(targetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buildSignalNote(signal), "utf8");
    const aggregatePaths = this.rebuildAggregateNotes(allSignals, signal);
    return { path: targetPath, created, aggregatePaths };
  }

  getNotePath(signal: GraphSignalRecord): string {
    return path.join(
      this.signalsDir,
      sanitizePathSegment(signal.source),
      `${compactTitleSlug(signal.title)}.md`
    );
  }

  private rebuildAggregateNotes(allSignals: GraphSignalRecord[], signal: GraphSignalRecord): string[] {
    const paths: string[] = [];
    const workSlugCache = new Map<string, string>();
    const workSlugTaken = new Set<string>();

    for (const entity of signal.entityRefs) {
      const related = allSignals.filter((entry) => entry.entityRefs.includes(entity));
      if (!related.length) continue;
      const notePath = path.join(this.peopleDir, `${sanitizePathSegment(entity)}.md`);
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, buildEntityAggregateNote(entity, related), "utf8");
      paths.push(notePath);
    }

    for (const project of signal.projectRefs) {
      const related = allSignals.filter((entry) => entry.projectRefs.includes(project));
      if (!related.length) continue;
      const notePath = path.join(this.projectsDir, `${sanitizePathSegment(project)}.md`);
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, buildProjectAggregateNote(project, related), "utf8");
      paths.push(notePath);
    }

    const workSignals = allSignals.filter((entry) => entry.objectId === signal.objectId);
    if (workSignals.length) {
      const slug = workSlugCache.get(signal.objectId) ?? makeUniqueSlug(buildWorkNoteSlugFromSignals(workSignals), workSlugTaken);
      workSlugCache.set(signal.objectId, slug);
      const notePath = path.join(this.workDir, `${slug}.md`);
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, buildWorkAggregateNote(signal.objectId, signal.objectType, workSignals), "utf8");
      paths.push(notePath);
    }

    const reviewSignals = allSignals
      .filter((entry) => entry.kind === "decision-candidate" || entry.kind === "project-link")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 25);
    if (reviewSignals.length) {
      const reviewPath = path.join(this.reviewDir, "document-promotion-candidates.md");
      fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
      fs.writeFileSync(reviewPath, buildDocumentReviewNote(reviewSignals), "utf8");
      paths.push(reviewPath);
    }

    const emailSignals = allSignals
      .filter((entry) => entry.source === "email")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 25);
    if (emailSignals.length) {
      const reviewPath = path.join(this.reviewDir, "email-promotion-candidates.md");
      fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
      fs.writeFileSync(reviewPath, buildEmailReviewNote(emailSignals), "utf8");
      paths.push(reviewPath);
    }

    const conversationSignals = allSignals
      .filter((entry) => entry.source === "conversation")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 25);
    if (conversationSignals.length) {
      const reviewPath = path.join(this.reviewDir, "conversation-memory-candidates.md");
      fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
      fs.writeFileSync(reviewPath, buildConversationReviewNote(conversationSignals), "utf8");
      paths.push(reviewPath);
    }

    const debugPath = path.join(this.reviewDir, "signal-debug-summary.md");
    fs.mkdirSync(path.dirname(debugPath), { recursive: true });
    fs.writeFileSync(debugPath, buildSignalDebugSummary(allSignals), "utf8");
    paths.push(debugPath);

    paths.push(...this.rebuildKnowledgeNotes(allSignals, signal, workSlugCache, workSlugTaken));

    return paths;
  }

  private rebuildKnowledgeNotes(
    allSignals: GraphSignalRecord[],
    signal: GraphSignalRecord,
    workSlugCache: Map<string, string>,
    workSlugTaken: Set<string>,
  ): string[] {
    const paths: string[] = [];

    for (const project of signal.projectRefs) {
      const related = allSignals.filter((entry) => entry.projectRefs.includes(project));
      if (!related.length) continue;
      const notePath = path.join(this.knowledgeProjectsDir, `${sanitizePathSegment(project)}.md`);
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, buildKnowledgeProjectNote(project, related), "utf8");
      paths.push(notePath);
    }

    for (const entity of signal.entityRefs) {
      if (!shouldPromoteKnowledgePerson(entity, allSignals)) continue;
      const related = allSignals.filter((entry) => entry.entityRefs.includes(entity));
      const notePath = path.join(this.knowledgePeopleDir, `${sanitizePathSegment(entity)}.md`);
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, buildKnowledgePersonNote(entity, related), "utf8");
      paths.push(notePath);
    }

    const workSignals = allSignalsForObject(allSignals, signal.objectId);
    if (workSignals.length && shouldPromoteKnowledgeWork(workSignals)) {
      const slug = workSlugCache.get(signal.objectId) ?? makeUniqueSlug(buildWorkNoteSlugFromSignals(workSignals), workSlugTaken);
      workSlugCache.set(signal.objectId, slug);
      const notePath = path.join(this.knowledgeWorkDir, `${slug}.md`);
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, buildKnowledgeWorkNote(signal.objectId, signal.objectType, workSignals), "utf8");
      paths.push(notePath);
    }

    return paths;
  }
}

function buildDocumentReviewNote(signals: GraphSignalRecord[]): string {
  return [
    "# Document Promotion Candidates",
    "",
    "**Type:** Signal Review",
    `**Count:** ${signals.length}`,
    "",
    "## Candidates",
    "",
    ...signals.map((signal) => `- ${signal.occurredAt}: [${signal.metadata.app || signal.source}/${signal.kind}] ${signal.title} | confidence=${signal.confidence ?? "-"} | projects=${formatList(signal.projectRefs)}`),
  ].join("\n");
}

function buildEmailReviewNote(signals: GraphSignalRecord[]): string {
  return [
    "# Email Promotion Candidates",
    "",
    "**Type:** Signal Review",
    `**Count:** ${signals.length}`,
    "",
    "## Candidates",
    "",
    ...signals.map((signal) => `- ${signal.occurredAt}: [${signal.metadata.app || signal.source}/${signal.kind}] ${signal.title} | confidence=${signal.confidence ?? "-"} | projects=${formatList(signal.projectRefs)}`),
  ].join("\n");
}

function buildConversationReviewNote(signals: GraphSignalRecord[]): string {
  return [
    "# Conversation Memory Candidates",
    "",
    "**Type:** Signal Review",
    `**Count:** ${signals.length}`,
    "",
    "## Candidates",
    "",
    ...signals.map((signal) => `- ${signal.occurredAt}: [${signal.kind}] ${signal.summary || signal.title} | confidence=${signal.confidence ?? "-"}`),
  ].join("\n");
}

function buildSignalDebugSummary(signals: GraphSignalRecord[]): string {
  const bySource = new Map<string, number>();
  const byKind = new Map<string, number>();

  for (const signal of signals) {
    bySource.set(signal.source, (bySource.get(signal.source) ?? 0) + 1);
    byKind.set(signal.kind, (byKind.get(signal.kind) ?? 0) + 1);
  }

  return [
    "# Signal Debug Summary",
    "",
    `**Total Signals:** ${signals.length}`,
    "",
    "## By Source",
    "",
    ...Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]).map(([source, count]) => `- ${source}: ${count}`),
    "",
    "## By Kind",
    "",
    ...Array.from(byKind.entries()).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `- ${kind}: ${count}`),
  ].join("\n");
}
