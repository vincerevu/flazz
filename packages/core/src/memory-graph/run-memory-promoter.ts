import fs from "node:fs";
import path from "node:path";
import type { RunMemoryRecord } from "../run-memory/run-memory-types.js";

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
}

function formatList(items: string[]): string {
  return items.length ? items.join(", ") : "-";
}

function formatBulletList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function buildRunMemoryNote(record: RunMemoryRecord): string {
  const createdDate = record.createdAt.slice(0, 10);

  return [
    `# Run ${record.runId}`,
    "",
    `**Type:** Run`,
    `**Run ID:** ${record.runId}`,
    `**Agent:** ${record.agentId}`,
    `**Outcome:** ${record.outcome}`,
    `**Created:** ${record.createdAt}`,
    `**Date:** ${createdDate}`,
    `**Source:** Run Memory`,
    `**Provenance:** run-memory:${record.id}`,
    `**Task Type:** ${record.taskType || "-"}`,
    `**Skills:** ${formatList(record.skillRefs)}`,
    `**Tools:** ${formatList(record.toolRefs)}`,
    `**Projects:** ${formatList(record.projectRefs)}`,
    `**Topics:** ${formatList(record.topicRefs)}`,
    `**Entities:** ${formatList(record.entityRefs)}`,
    `**Artifacts:** ${formatList(record.artifactRefs)}`,
    `**Failure Category:** ${record.failureCategory || "-"}`,
    "",
    "## Summary",
    "",
    record.summary,
    "",
    "## User Request",
    "",
    record.firstUserMessage || "_No user request captured_",
    "",
    "## Corrections",
    "",
    formatBulletList(record.corrections),
    "",
    "## References",
    "",
    `- Run Memory Record ID: ${record.id}`,
    `- Run ID: ${record.runId}`,
    `- Outcome: ${record.outcome}`,
  ].join("\n");
}

export class RunMemoryGraphPromoter {
  private readonly runsDir: string;
  private readonly workflowsDir: string;
  private readonly failuresDir: string;

  constructor(workDir: string) {
    this.runsDir = path.join(workDir, "memory", "Runs");
    this.workflowsDir = path.join(workDir, "memory", "Workflows");
    this.failuresDir = path.join(workDir, "memory", "Failure Patterns");
  }

  promote(
    record: RunMemoryRecord,
    allRecords: RunMemoryRecord[] = [record]
  ): {
    path: string;
    created: boolean;
    workflowPaths: string[];
    failurePath?: string;
  } {
    const targetPath = this.getNotePath(record);
    const created = !fs.existsSync(targetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buildRunMemoryNote(record), "utf8");
    const workflowPaths = this.rebuildWorkflowNotes(allRecords);
    const failurePath = this.rebuildFailureNote(record.failureCategory, allRecords);
    return { path: targetPath, created, workflowPaths, failurePath };
  }

  getNotePath(record: RunMemoryRecord): string {
    const day = record.createdAt.slice(0, 10);
    return path.join(
      this.runsDir,
      day,
      `${sanitizePathSegment(record.runId || record.id)}.md`
    );
  }

  private rebuildWorkflowNotes(records: RunMemoryRecord[]): string[] {
    const aggregates = new Map<
      string,
      {
        key: string;
        skillName?: string;
        taskType?: string;
        records: RunMemoryRecord[];
      }
    >();

    for (const record of records) {
      if (record.skillRefs.length) {
        for (const skillRef of record.skillRefs) {
          const key = `skill:${skillRef}`;
          const aggregate = aggregates.get(key) ?? {
            key,
            skillName: skillRef,
            records: [],
          };
          aggregate.records.push(record);
          aggregates.set(key, aggregate);
        }
        continue;
      }

      if (record.taskType) {
        const key = `task:${record.taskType}`;
        const aggregate = aggregates.get(key) ?? {
          key,
          taskType: record.taskType,
          records: [],
        };
        aggregate.records.push(record);
        aggregates.set(key, aggregate);
      }
    }

    const written: string[] = [];
    for (const aggregate of aggregates.values()) {
      const notePath = path.join(
        this.workflowsDir,
        `${sanitizePathSegment(aggregate.skillName || aggregate.taskType || aggregate.key)}.md`
      );
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, buildWorkflowAggregateNote(aggregate), "utf8");
      written.push(notePath);
    }

    return written;
  }

  private rebuildFailureNote(
    failureCategory: RunMemoryRecord["failureCategory"],
    records: RunMemoryRecord[]
  ): string | undefined {
    if (!failureCategory) {
      return undefined;
    }

    const related = records.filter((record) => record.failureCategory === failureCategory);
    if (!related.length) {
      return undefined;
    }

    const notePath = path.join(this.failuresDir, `${sanitizePathSegment(failureCategory)}.md`);
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.writeFileSync(notePath, buildFailureAggregateNote(failureCategory, related), "utf8");
    return notePath;
  }
}

function buildWorkflowAggregateNote(input: {
  key: string;
  skillName?: string;
  taskType?: string;
  records: RunMemoryRecord[];
}): string {
  const successes = input.records.filter((record) => record.outcome === "success").length;
  const failures = input.records.filter((record) => record.outcome === "failure").length;
  const stopped = input.records.filter((record) => record.outcome === "stopped").length;
  const latest = [...input.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const tools = Array.from(new Set(input.records.flatMap((record) => record.toolRefs))).slice(0, 10);
  const projects = Array.from(new Set(input.records.flatMap((record) => record.projectRefs))).slice(0, 10);
  const entities = Array.from(new Set(input.records.flatMap((record) => record.entityRefs))).slice(0, 10);
  const title = input.skillName || input.taskType || input.key;

  return [
    `# ${title}`,
    "",
    `**Type:** Workflow`,
    `**Source:** Run Memory Aggregate`,
    `**Provenance:** workflow:${input.key}`,
    `**Successes:** ${successes}`,
    `**Failures:** ${failures}`,
    `**Stopped:** ${stopped}`,
    `**Latest Run:** ${latest?.runId || "-"}`,
    `**Last Updated:** ${latest?.createdAt || "-"}`,
    `**Tools:** ${formatList(tools)}`,
    `**Projects:** ${formatList(projects)}`,
    `**Entities:** ${formatList(entities)}`,
    "",
    "## Recent Runs",
    "",
    ...input.records
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((record) => `- ${record.createdAt}: ${record.runId} (${record.outcome}) - ${record.summary}`),
  ].join("\n");
}

function buildFailureAggregateNote(
  failureCategory: NonNullable<RunMemoryRecord["failureCategory"]>,
  records: RunMemoryRecord[]
): string {
  const latest = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const tools = Array.from(new Set(records.flatMap((record) => record.toolRefs))).slice(0, 10);
  const skills = Array.from(new Set(records.flatMap((record) => record.skillRefs))).slice(0, 10);

  return [
    `# ${failureCategory}`,
    "",
    `**Type:** Failure Pattern`,
    `**Source:** Run Memory Aggregate`,
    `**Provenance:** failure:${failureCategory}`,
    `**Occurrences:** ${records.length}`,
    `**Latest Run:** ${latest?.runId || "-"}`,
    `**Last Updated:** ${latest?.createdAt || "-"}`,
    `**Tools:** ${formatList(tools)}`,
    `**Skills:** ${formatList(skills)}`,
    "",
    "## Recent Failures",
    "",
    ...records
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((record) => `- ${record.createdAt}: ${record.runId} (${record.outcome}) - ${record.summary}`),
    "",
    "## Corrections Observed",
    "",
    ...Array.from(new Set(records.flatMap((record) => record.corrections)))
      .slice(0, 12)
      .map((correction) => `- ${correction}`),
  ].join("\n");
}
