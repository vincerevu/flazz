import fs from "node:fs/promises";
import path from "node:path";
import { GraphSignal as GraphSignalSchema } from "@flazz/shared/dist/graph-signals.js";
import { z } from "zod";
import { WorkDir } from "../config/config.js";
import {
  createPrismaClient,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";

type GraphSignalRecord = z.infer<typeof GraphSignalSchema>;
const LEGACY_STATE_RELATIVE_PATH = path.join("data", "graph-signals", "signals.json");
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:graph_signals";
const LegacyGraphSignalState = z.object({
  signals: z.array(GraphSignalSchema).default([]),
});

export interface IGraphSignalRepo {
  list(): Promise<GraphSignalRecord[]>;
  getByFingerprint(fingerprint: string): Promise<GraphSignalRecord | null>;
  upsert(signal: GraphSignalRecord): Promise<{ created: boolean }>;
}

export class SqliteGraphSignalRepo implements IGraphSignalRepo {
  private readonly prisma: FlazzPrismaClient;
  private readonly storage?: PrismaStorageOptions;
  private ready: Promise<void> | null = null;

  constructor({
    prisma,
    storage,
  }: {
    prisma?: FlazzPrismaClient;
    storage?: PrismaStorageOptions;
  } = {}) {
    this.storage = storage;
    this.prisma = prisma ?? createPrismaClient(storage);
  }

  private ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    return this.ready;
  }

  private async initialize(): Promise<void> {
    await applySqliteMigrations({ prisma: this.prisma, storage: this.storage });
    await this.importLegacySignalsOnce();
  }

  async list(): Promise<GraphSignalRecord[]> {
    await this.ensureReady();
    const rows = await this.prisma.graphSignal.findMany({
      orderBy: [
        { occurredAt: "desc" },
        { fingerprint: "desc" },
      ],
      take: 5000,
    });
    return rows.flatMap((row) => this.parseSignal(row.dataJson));
  }

  async getByFingerprint(fingerprint: string): Promise<GraphSignalRecord | null> {
    await this.ensureReady();
    const row = await this.prisma.graphSignal.findUnique({
      where: { fingerprint },
      select: { dataJson: true },
    });
    return row ? this.parseSignal(row.dataJson)[0] ?? null : null;
  }

  async upsert(signal: GraphSignalRecord): Promise<{ created: boolean }> {
    await this.ensureReady();
    return this.upsertValidatedSignal(signal);
  }

  private async upsertValidatedSignal(signal: GraphSignalRecord): Promise<{ created: boolean }> {
    const existing = await this.prisma.graphSignal.findUnique({
      where: { fingerprint: signal.fingerprint },
      select: { fingerprint: true },
    });
    await this.prisma.graphSignal.upsert({
      where: { fingerprint: signal.fingerprint },
      create: {
        fingerprint: signal.fingerprint,
        occurredAt: new Date(signal.occurredAt),
        source: signal.source,
        objectType: signal.objectType,
        objectId: signal.objectId,
        confidence: signal.confidence ?? null,
        dataJson: JSON.stringify(signal),
        updatedAt: new Date(),
      },
      update: {
        occurredAt: new Date(signal.occurredAt),
        source: signal.source,
        objectType: signal.objectType,
        objectId: signal.objectId,
        confidence: signal.confidence ?? null,
        dataJson: JSON.stringify(signal),
        updatedAt: new Date(),
      },
    });
    return { created: !existing };
  }

  private async importLegacySignalsOnce(): Promise<void> {
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
        const state = LegacyGraphSignalState.parse(JSON.parse(raw));
        for (const signal of state.signals) {
          await this.upsertValidatedSignal(signal);
        }
      }
    } catch (error) {
      console.error("[SqliteGraphSignalRepo] Failed to import legacy signals:", error);
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

  private parseSignal(dataJson: string): GraphSignalRecord[] {
    try {
      return [GraphSignalSchema.parse(JSON.parse(dataJson))];
    } catch (error) {
      console.error("[SqliteGraphSignalRepo] Failed to parse signal:", error);
      return [];
    }
  }
}
