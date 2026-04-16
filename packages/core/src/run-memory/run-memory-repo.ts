import fs from "node:fs";
import path from "node:path";
import { RunMemoryRecord } from "@flazz/shared";
import { z } from "zod";

const RunMemoryState = z.object({
  records: z.array(RunMemoryRecord).default([]),
});

type RunMemoryState = z.infer<typeof RunMemoryState>;
type RunMemoryRecord = z.infer<typeof RunMemoryRecord>;

export class RunMemoryRepo {
  private readonly stateFile: string;

  constructor(workDir: string) {
    this.stateFile = path.join(workDir, "data", "run-memory", "records.json");
  }

  list(): RunMemoryRecord[] {
    return this.load().records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getByRunId(runId: string): RunMemoryRecord | null {
    return this.load().records.find((record) => record.runId === runId) ?? null;
  }

  upsert(record: RunMemoryRecord): void {
    const state = this.load();
    const nextRecords = state.records.filter((entry) => entry.runId !== record.runId);
    nextRecords.push(record);
    state.records = nextRecords
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 1000);
    this.save(state);
  }

  private ensureDir(): void {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): RunMemoryState {
    try {
      if (fs.existsSync(this.stateFile)) {
        return RunMemoryState.parse(JSON.parse(fs.readFileSync(this.stateFile, "utf8")));
      }
    } catch (error) {
      console.error("[RunMemoryRepo] Failed to load state:", error);
    }

    return { records: [] };
  }

  private save(state: RunMemoryState): void {
    this.ensureDir();
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}

