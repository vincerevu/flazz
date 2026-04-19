import fs from "node:fs";
import path from "node:path";
import { GraphSignal as GraphSignalSchema, GraphSignalState as GraphSignalStateSchema } from "@flazz/shared/dist/graph-signals.js";
import { z } from "zod";

type GraphSignalRecord = z.infer<typeof GraphSignalSchema>;
type GraphSignalStateRecord = z.infer<typeof GraphSignalStateSchema>;

export class GraphSignalRepo {
  private readonly stateFile: string;

  constructor(workDir: string) {
    this.stateFile = path.join(workDir, "data", "graph-signals", "signals.json");
  }

  list(): GraphSignalRecord[] {
    return this.load().signals.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  getByFingerprint(fingerprint: string): GraphSignalRecord | null {
    return this.load().signals.find((signal) => signal.fingerprint === fingerprint) ?? null;
  }

  upsert(signal: GraphSignalRecord): { created: boolean } {
    const state = this.load();
    const existing = state.signals.find((entry) => entry.fingerprint === signal.fingerprint);
    const created = !existing;
    state.signals = state.signals.filter((entry) => entry.fingerprint !== signal.fingerprint);
    state.signals.push(signal);
    state.signals = state.signals
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 5000);
    state.lastUpdatedAt = new Date().toISOString();
    this.save(state);
    return { created };
  }

  private ensureDir(): void {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): GraphSignalStateRecord {
    try {
      if (fs.existsSync(this.stateFile)) {
        return GraphSignalStateSchema.parse(JSON.parse(fs.readFileSync(this.stateFile, "utf8")));
      }
    } catch (error) {
      console.error("[GraphSignalRepo] Failed to load state:", error);
    }

    return { signals: [] };
  }

  private save(state: GraphSignalStateRecord): void {
    this.ensureDir();
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}
