import fs from "node:fs";
import path from "node:path";
import type { GraphSyncSource } from "./graph-sync-policy.js";

export type GraphSyncSourceState = {
  source: GraphSyncSource;
  day: string;
  lastReadAt?: string;
  lastSignalAt?: string;
  readsToday: number;
  itemsSeenToday: number;
  signalsToday: number;
  classificationCallsToday: number;
  distillCallsToday: number;
};

export type GraphSyncAppState = {
  app: string;
  source: GraphSyncSource;
  day: string;
  lastListReadAt?: string;
  lastDetailReadAt?: string;
  listReadsToday: number;
  detailReadsToday: number;
  consecutiveFailures: number;
  backoffUntil?: string;
  lastError?: string;
  bootstrapVersion?: number;
  bootstrapCompletedAt?: string;
};

export type GraphSyncObjectState = {
  app: string;
  objectId: string;
  lastSeenAt?: string;
  lastDetailAt?: string;
  lastFingerprint?: string;
};

type GraphSyncState = {
  sources: GraphSyncSourceState[];
  apps: GraphSyncAppState[];
  objects: GraphSyncObjectState[];
  lastUpdatedAt?: string;
};

function normalizeState(input: Partial<GraphSyncState> | null | undefined): GraphSyncState {
  return {
    sources: Array.isArray(input?.sources) ? input.sources : [],
    apps: Array.isArray(input?.apps) ? input.apps : [],
    objects: Array.isArray(input?.objects) ? input.objects : [],
    lastUpdatedAt: input?.lastUpdatedAt,
  };
}

function defaultSourceState(source: GraphSyncSource, day: string): GraphSyncSourceState {
  return {
    source,
    day,
    readsToday: 0,
    itemsSeenToday: 0,
    signalsToday: 0,
    classificationCallsToday: 0,
    distillCallsToday: 0,
  };
}

function defaultAppState(app: string, source: GraphSyncSource, day: string): GraphSyncAppState {
  return {
    app,
    source,
    day,
    listReadsToday: 0,
    detailReadsToday: 0,
    consecutiveFailures: 0,
  };
}

export class GraphSyncStateRepo {
  private readonly stateFile: string;

  constructor(workDir: string) {
    this.stateFile = path.join(workDir, "data", "graph-signals", "sync-state.json");
  }

  getSourceState(source: GraphSyncSource, day: string): GraphSyncSourceState {
    const state = this.load();
    return state.sources.find((entry) => entry.source === source && entry.day === day) ?? defaultSourceState(source, day);
  }

  getAppState(app: string, source: GraphSyncSource, day: string): GraphSyncAppState {
    const state = this.load();
    return state.apps.find((entry) => entry.app === app && entry.source === source && entry.day === day) ?? defaultAppState(app, source, day);
  }

  getLatestAppState(app: string, source: GraphSyncSource): GraphSyncAppState | null {
    const state = this.load();
    return state.apps
      .filter((entry) => entry.app === app && entry.source === source)
      .sort((a, b) => b.day.localeCompare(a.day))
      [0] ?? null;
  }

  getObjectState(app: string, objectId: string): GraphSyncObjectState | null {
    const state = this.load();
    return state.objects.find((entry) => entry.app === app && entry.objectId === objectId) ?? null;
  }

  upsertSourceState(next: GraphSyncSourceState) {
    const state = this.load();
    state.sources = state.sources.filter((entry) => !(entry.source === next.source && entry.day === next.day));
    state.sources.push(next);
    state.sources = state.sources.slice(-200);
    state.lastUpdatedAt = new Date().toISOString();
    this.save(state);
  }

  upsertAppState(next: GraphSyncAppState) {
    const state = this.load();
    state.apps = state.apps.filter((entry) => !(entry.app === next.app && entry.source === next.source && entry.day === next.day));
    state.apps.push(next);
    state.apps = state.apps.slice(-400);
    state.lastUpdatedAt = new Date().toISOString();
    this.save(state);
  }

  upsertObjectState(next: GraphSyncObjectState) {
    const state = this.load();
    state.objects = state.objects.filter((entry) => !(entry.app === next.app && entry.objectId === next.objectId));
    state.objects.push(next);
    state.objects = state.objects.slice(-2000);
    state.lastUpdatedAt = new Date().toISOString();
    this.save(state);
  }

  listForDay(day: string) {
    return this.load().sources.filter((entry) => entry.day === day);
  }

  listAppStatesForDay(day: string) {
    return this.load().apps.filter((entry) => entry.day === day);
  }

  hasSourceHistory(source: GraphSyncSource) {
    return this.load().sources.some((entry) => entry.source === source && (entry.readsToday > 0 || !!entry.lastReadAt));
  }

  hasAppHistory(app: string, source: GraphSyncSource) {
    return this.load().apps.some((entry) => entry.app === app && entry.source === source && (entry.listReadsToday > 0 || entry.detailReadsToday > 0 || !!entry.lastListReadAt || !!entry.lastDetailReadAt));
  }

  private ensureDir() {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): GraphSyncState {
    try {
      if (fs.existsSync(this.stateFile)) {
        return normalizeState(JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as Partial<GraphSyncState>);
      }
    } catch (error) {
      console.error("[GraphSyncStateRepo] Failed to load state:", error);
    }
    return normalizeState(undefined);
  }

  private save(state: GraphSyncState) {
    this.ensureDir();
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}
