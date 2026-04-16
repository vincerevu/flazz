import { RunMemorySummary } from "@flazz/shared";
import { z } from "zod";
import { Run } from "@flazz/shared";
import { distillRunMemory } from "./run-memory-distiller.js";
import { RunMemoryRepo } from "./run-memory-repo.js";

type RunRecord = z.infer<typeof Run>;
type RunMemorySummary = z.infer<typeof RunMemorySummary>;

function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

export class RunMemoryService {
  constructor(private repo: RunMemoryRepo) {}

  recordRun(run: RunRecord): void {
    const record = distillRunMemory(run);
    this.repo.upsert(record);
  }

  list(limit = 20): RunMemorySummary[] {
    return this.repo.list().slice(0, limit).map((record) => ({
      ...record,
      preview: record.summary.slice(0, 220),
    }));
  }

  search(query: string, limit = 5): RunMemorySummary[] {
    const queryWords = normalizeWords(query);
    const results = this.repo
      .list()
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
