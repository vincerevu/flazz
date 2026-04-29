import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { WorkDir } from "../config/config.js";
import {
  createPrismaClient,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";
import type { GraphSyncSource } from "./graph-sync-policy.js";

const LEGACY_STATE_RELATIVE_PATH = path.join("data", "graph-signals", "sync-state.json");
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:graph_sync_state";

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

const LegacySourceState = z.object({
  source: z.string(),
  day: z.string(),
  lastReadAt: z.string().optional(),
  lastSignalAt: z.string().optional(),
  readsToday: z.number().int().nonnegative().default(0),
  itemsSeenToday: z.number().int().nonnegative().default(0),
  signalsToday: z.number().int().nonnegative().default(0),
  classificationCallsToday: z.number().int().nonnegative().default(0),
  distillCallsToday: z.number().int().nonnegative().default(0),
});

const LegacyAppState = z.object({
  app: z.string(),
  source: z.string(),
  day: z.string(),
  lastListReadAt: z.string().optional(),
  lastDetailReadAt: z.string().optional(),
  listReadsToday: z.number().int().nonnegative().default(0),
  detailReadsToday: z.number().int().nonnegative().default(0),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  backoffUntil: z.string().optional(),
  lastError: z.string().optional(),
  bootstrapVersion: z.number().int().optional(),
  bootstrapCompletedAt: z.string().optional(),
});

const LegacyObjectState = z.object({
  app: z.string(),
  objectId: z.string(),
  lastSeenAt: z.string().optional(),
  lastDetailAt: z.string().optional(),
  lastFingerprint: z.string().optional(),
});

const LegacyGraphSyncState = z.object({
  sources: z.array(LegacySourceState).default([]),
  apps: z.array(LegacyAppState).default([]),
  objects: z.array(LegacyObjectState).default([]),
});

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

type SourceRow = {
  source: string;
  day: string;
  last_read_at: string | null;
  last_signal_at: string | null;
  reads_today: number;
  items_seen_today: number;
  signals_today: number;
  classification_calls_today: number;
  distill_calls_today: number;
};

type AppRow = {
  app: string;
  source: string;
  day: string;
  last_list_read_at: string | null;
  last_detail_read_at: string | null;
  list_reads_today: number;
  detail_reads_today: number;
  consecutive_failures: number;
  backoff_until: string | null;
  last_error: string | null;
  bootstrap_version: number | null;
  bootstrap_completed_at: string | null;
};

type ObjectRow = {
  app: string;
  object_id: string;
  last_seen_at: string | null;
  last_detail_at: string | null;
  last_fingerprint: string | null;
};

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

function sourceFromRow(row: SourceRow): GraphSyncSourceState {
  return {
    source: row.source as GraphSyncSource,
    day: row.day,
    lastReadAt: row.last_read_at ?? undefined,
    lastSignalAt: row.last_signal_at ?? undefined,
    readsToday: row.reads_today,
    itemsSeenToday: row.items_seen_today,
    signalsToday: row.signals_today,
    classificationCallsToday: row.classification_calls_today,
    distillCallsToday: row.distill_calls_today,
  };
}

function appFromRow(row: AppRow): GraphSyncAppState {
  return {
    app: row.app,
    source: row.source as GraphSyncSource,
    day: row.day,
    lastListReadAt: row.last_list_read_at ?? undefined,
    lastDetailReadAt: row.last_detail_read_at ?? undefined,
    listReadsToday: row.list_reads_today,
    detailReadsToday: row.detail_reads_today,
    consecutiveFailures: row.consecutive_failures,
    backoffUntil: row.backoff_until ?? undefined,
    lastError: row.last_error ?? undefined,
    bootstrapVersion: row.bootstrap_version ?? undefined,
    bootstrapCompletedAt: row.bootstrap_completed_at ?? undefined,
  };
}

function objectFromRow(row: ObjectRow): GraphSyncObjectState {
  return {
    app: row.app,
    objectId: row.object_id,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastDetailAt: row.last_detail_at ?? undefined,
    lastFingerprint: row.last_fingerprint ?? undefined,
  };
}

export interface IGraphSyncStateRepo {
  getSourceState(source: GraphSyncSource, day: string): Promise<GraphSyncSourceState>;
  getAppState(app: string, source: GraphSyncSource, day: string): Promise<GraphSyncAppState>;
  getLatestAppState(app: string, source: GraphSyncSource): Promise<GraphSyncAppState | null>;
  getObjectState(app: string, objectId: string): Promise<GraphSyncObjectState | null>;
  upsertSourceState(next: GraphSyncSourceState): Promise<void>;
  upsertAppState(next: GraphSyncAppState): Promise<void>;
  upsertObjectState(next: GraphSyncObjectState): Promise<void>;
  listForDay(day: string): Promise<GraphSyncSourceState[]>;
  listAppStatesForDay(day: string): Promise<GraphSyncAppState[]>;
  hasSourceHistory(source: GraphSyncSource): Promise<boolean>;
  hasAppHistory(app: string, source: GraphSyncSource): Promise<boolean>;
}

export class SqliteGraphSyncStateRepo implements IGraphSyncStateRepo {
  private readonly prisma: FlazzPrismaClient;
  private readonly storage?: PrismaStorageOptions;
  private ready: Promise<void> | null = null;

  constructor(options: {
    prisma?: FlazzPrismaClient;
    storage?: PrismaStorageOptions;
  } | string = {}) {
    const { prisma, storage } = typeof options === "string"
      ? { prisma: undefined, storage: { workDir: options } }
      : options;
    this.storage = storage;
    this.prisma = prisma ?? createPrismaClient(storage);
  }

  private ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    return this.ready;
  }

  private async initialize(): Promise<void> {
    await applySqliteMigrations({ prisma: this.prisma, storage: this.storage });
    await this.importLegacyStateOnce();
  }

  async getSourceState(source: GraphSyncSource, day: string): Promise<GraphSyncSourceState> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<SourceRow[]>(
      `SELECT * FROM graph_sync_sources WHERE source = ? AND day = ? LIMIT 1`,
      source,
      day,
    );
    return rows[0] ? sourceFromRow(rows[0]) : defaultSourceState(source, day);
  }

  async getAppState(app: string, source: GraphSyncSource, day: string): Promise<GraphSyncAppState> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<AppRow[]>(
      `SELECT * FROM graph_sync_apps WHERE app = ? AND source = ? AND day = ? LIMIT 1`,
      app,
      source,
      day,
    );
    return rows[0] ? appFromRow(rows[0]) : defaultAppState(app, source, day);
  }

  async getLatestAppState(app: string, source: GraphSyncSource): Promise<GraphSyncAppState | null> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<AppRow[]>(
      `SELECT * FROM graph_sync_apps WHERE app = ? AND source = ? ORDER BY day DESC LIMIT 1`,
      app,
      source,
    );
    return rows[0] ? appFromRow(rows[0]) : null;
  }

  async getObjectState(app: string, objectId: string): Promise<GraphSyncObjectState | null> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<ObjectRow[]>(
      `SELECT * FROM graph_sync_objects WHERE app = ? AND object_id = ? LIMIT 1`,
      app,
      objectId,
    );
    return rows[0] ? objectFromRow(rows[0]) : null;
  }

  async upsertSourceState(next: GraphSyncSourceState): Promise<void> {
    await this.ensureReady();
    await this.upsertValidatedSourceState(next);
  }

  private async upsertValidatedSourceState(next: GraphSyncSourceState): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
INSERT INTO graph_sync_sources (
  source, day, last_read_at, last_signal_at, reads_today, items_seen_today,
  signals_today, classification_calls_today, distill_calls_today, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source, day) DO UPDATE SET
  last_read_at = excluded.last_read_at,
  last_signal_at = excluded.last_signal_at,
  reads_today = excluded.reads_today,
  items_seen_today = excluded.items_seen_today,
  signals_today = excluded.signals_today,
  classification_calls_today = excluded.classification_calls_today,
  distill_calls_today = excluded.distill_calls_today,
  updated_at = excluded.updated_at
`,
      next.source,
      next.day,
      next.lastReadAt ?? null,
      next.lastSignalAt ?? null,
      next.readsToday,
      next.itemsSeenToday,
      next.signalsToday,
      next.classificationCallsToday,
      next.distillCallsToday,
      new Date().toISOString(),
    );
  }

  async upsertAppState(next: GraphSyncAppState): Promise<void> {
    await this.ensureReady();
    await this.upsertValidatedAppState(next);
  }

  private async upsertValidatedAppState(next: GraphSyncAppState): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
INSERT INTO graph_sync_apps (
  app, source, day, last_list_read_at, last_detail_read_at, list_reads_today,
  detail_reads_today, consecutive_failures, backoff_until, last_error,
  bootstrap_version, bootstrap_completed_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(app, source, day) DO UPDATE SET
  last_list_read_at = excluded.last_list_read_at,
  last_detail_read_at = excluded.last_detail_read_at,
  list_reads_today = excluded.list_reads_today,
  detail_reads_today = excluded.detail_reads_today,
  consecutive_failures = excluded.consecutive_failures,
  backoff_until = excluded.backoff_until,
  last_error = excluded.last_error,
  bootstrap_version = excluded.bootstrap_version,
  bootstrap_completed_at = excluded.bootstrap_completed_at,
  updated_at = excluded.updated_at
`,
      next.app,
      next.source,
      next.day,
      next.lastListReadAt ?? null,
      next.lastDetailReadAt ?? null,
      next.listReadsToday,
      next.detailReadsToday,
      next.consecutiveFailures,
      next.backoffUntil ?? null,
      next.lastError ?? null,
      next.bootstrapVersion ?? null,
      next.bootstrapCompletedAt ?? null,
      new Date().toISOString(),
    );
  }

  async upsertObjectState(next: GraphSyncObjectState): Promise<void> {
    await this.ensureReady();
    await this.upsertValidatedObjectState(next);
  }

  private async upsertValidatedObjectState(next: GraphSyncObjectState): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
INSERT INTO graph_sync_objects (
  app, object_id, last_seen_at, last_detail_at, last_fingerprint, updated_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(app, object_id) DO UPDATE SET
  last_seen_at = excluded.last_seen_at,
  last_detail_at = excluded.last_detail_at,
  last_fingerprint = excluded.last_fingerprint,
  updated_at = excluded.updated_at
`,
      next.app,
      next.objectId,
      next.lastSeenAt ?? null,
      next.lastDetailAt ?? null,
      next.lastFingerprint ?? null,
      new Date().toISOString(),
    );
  }

  private async importLegacyStateOnce(): Promise<void> {
    const marker = await this.prisma.appKv.findUnique({ where: { key: LEGACY_IMPORT_MARKER_KEY } });
    if (marker) {
      return;
    }

    try {
      const legacyPath = this.legacyStatePath();
      if (!legacyPath) {
        return;
      }
      const raw = await fs.readFile(legacyPath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (raw) {
        const state = LegacyGraphSyncState.parse(JSON.parse(raw));
        for (const source of state.sources) {
          await this.upsertValidatedSourceState(source as GraphSyncSourceState);
        }
        for (const app of state.apps) {
          await this.upsertValidatedAppState(app as GraphSyncAppState);
        }
        for (const object of state.objects) {
          await this.upsertValidatedObjectState(object);
        }
      }
    } catch (error) {
      console.error("[SqliteGraphSyncStateRepo] Failed to import legacy state:", error);
    } finally {
      await this.prisma.appKv.upsert({
        where: { key: LEGACY_IMPORT_MARKER_KEY },
        create: { key: LEGACY_IMPORT_MARKER_KEY, valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
        update: { valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
      });
    }
  }

  private legacyStatePath(): string | null {
    if (this.storage?.databaseUrl && !this.storage.workDir) return null;
    return path.join(this.storage?.workDir ?? WorkDir, LEGACY_STATE_RELATIVE_PATH);
  }

  async listForDay(day: string): Promise<GraphSyncSourceState[]> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<SourceRow[]>(
      `SELECT * FROM graph_sync_sources WHERE day = ? ORDER BY source ASC`,
      day,
    );
    return rows.map(sourceFromRow);
  }

  async listAppStatesForDay(day: string): Promise<GraphSyncAppState[]> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<AppRow[]>(
      `SELECT * FROM graph_sync_apps WHERE day = ? ORDER BY app ASC`,
      day,
    );
    return rows.map(appFromRow);
  }

  async hasSourceHistory(source: GraphSyncSource): Promise<boolean> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) AS count FROM graph_sync_sources WHERE source = ? AND (reads_today > 0 OR last_read_at IS NOT NULL)`,
      source,
    );
    return (rows[0]?.count ?? 0) > 0;
  }

  async hasAppHistory(app: string, source: GraphSyncSource): Promise<boolean> {
    await this.ensureReady();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `
SELECT COUNT(*) AS count
FROM graph_sync_apps
WHERE app = ?
  AND source = ?
  AND (list_reads_today > 0 OR detail_reads_today > 0 OR last_list_read_at IS NOT NULL OR last_detail_read_at IS NOT NULL)
`,
      app,
      source,
    );
    return (rows[0]?.count ?? 0) > 0;
  }
}

export { SqliteGraphSyncStateRepo as GraphSyncStateRepo };
