import { RunMemorySummary } from "@flazz/shared";
import { z } from "zod";
import { Run } from "@flazz/shared";
import { distillRunMemory } from "./run-memory-distiller.js";
import type { IRunMemoryRepo } from "./run-memory-repo.js";
import type { GraphSignalService } from "../memory-graph/graph-signal-service.js";

type RunRecord = z.infer<typeof Run>;
type RunMemoryRecord = ReturnType<typeof distillRunMemory>;
type RunMemorySummary = z.infer<typeof RunMemorySummary>;
type RunMemoryPromoter = {
  promote(
    record: RunMemoryRecord,
    allRecords: RunMemoryRecord[]
  ): {
    path: string;
    created: boolean;
    workflowPaths: string[];
    failurePath?: string;
  };
};

const INTERNAL_MEMORY_EXCLUDED_AGENTS = new Set([
  "note_creation",
  "labeling_agent",
  "email-draft",
  "meeting-prep",
]);

function shouldRecordRunMemory(run: RunRecord): boolean {
  if (INTERNAL_MEMORY_EXCLUDED_AGENTS.has(run.agentId)) {
    return false;
  }

  return true;
}

function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

export class RunMemoryService {
  constructor(
    private repo: IRunMemoryRepo,
    private promoter?: RunMemoryPromoter,
    private graphSignalService?: Pick<GraphSignalService, "ingestRunMemoryRecord">
  ) {}

  async recordRun(run: RunRecord): Promise<void> {
    if (!shouldRecordRunMemory(run)) {
      return;
    }

    const record = distillRunMemory(run);
    await this.repo.upsert(record);
    this.promoter?.promote(record, await this.repo.list());
    await this.graphSignalService?.ingestRunMemoryRecord(record);
  }

  async list(limit = 20): Promise<RunMemorySummary[]> {
    return (await this.repo.list()).slice(0, limit).map((record) => ({
      ...record,
      preview: record.summary.slice(0, 220),
    }));
  }

  async search(query: string, limit = 5): Promise<RunMemorySummary[]> {
    const queryWords = normalizeWords(query);
    const results = (await this.repo.list())
      .map((record) => {
        const haystacks = [
          record.summary,
          record.firstUserMessage || "",
          record.entityRefs.join(" "),
          record.skillRefs.join(" "),
          record.toolRefs.join(" "),
        ].join(" ").toLowerCase();

        let keyword = 0;
        for (const word of queryWords) {
          if (haystacks.includes(word)) keyword += 2;
          if (record.entityRefs.some((entry: string) => entry.toLowerCase().includes(word))) keyword += 2;
          if (record.skillRefs.some((entry: string) => entry.toLowerCase().includes(word))) keyword += 1;
        }

        const recency = Math.max(
          0,
          2 - Math.min(2, Math.floor((Date.now() - new Date(record.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7)))
        );
        const failurePenalty = record.outcome === "success" ? 0 : -1;
        const score = keyword + recency + failurePenalty;
        return {
          ...record,
          score,
          preview: record.summary.slice(0, 220),
        };
      })
      .filter((record) => record.score > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);

    return results;
  }
}
