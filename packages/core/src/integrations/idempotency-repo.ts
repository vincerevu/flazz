import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type IdempotencyRecord = {
  fingerprint: string;
  app: string;
  capability: string;
  createdAt: string;
};

type IdempotencyState = {
  records: IdempotencyRecord[];
};

function fingerprint(input: Record<string, unknown>) {
  return crypto.createHash("sha1").update(JSON.stringify(input)).digest("hex");
}

export class IntegrationIdempotencyRepo {
  private readonly stateFile: string;

  constructor(workDir: string) {
    this.stateFile = path.join(workDir, "data", "integrations", "idempotency.json");
  }

  wasRecentlySeen(input: Record<string, unknown>, windowMs = 5 * 60 * 1000) {
    const state = this.load();
    const now = Date.now();
    const key = fingerprint(input);
    state.records = state.records.filter((record) => now - new Date(record.createdAt).getTime() <= windowMs);
    this.save(state);
    return state.records.some((record) => record.fingerprint === key);
  }

  record(input: Record<string, unknown>) {
    const state = this.load();
    const now = new Date().toISOString();
    const next: IdempotencyRecord = {
      fingerprint: fingerprint(input),
      app: String(input.app ?? ""),
      capability: String(input.capability ?? ""),
      createdAt: now,
    };
    state.records = [next, ...state.records].slice(0, 500);
    this.save(state);
  }

  private ensureDir() {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): IdempotencyState {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, "utf-8")) as IdempotencyState;
      }
    } catch (error) {
      console.error("[Integrations] Failed to load idempotency state:", error);
    }
    return { records: [] };
  }

  private save(state: IdempotencyState) {
    this.ensureDir();
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}
