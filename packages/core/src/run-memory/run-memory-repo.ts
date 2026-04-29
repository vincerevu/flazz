import fs from "node:fs/promises";
import path from "node:path";
import { RunMemoryRecord } from "@flazz/shared";
import { z } from "zod";
import { WorkDir } from "../config/config.js";
import {
  createPrismaClient,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";

type RunMemoryRecord = z.infer<typeof RunMemoryRecord>;
const LEGACY_STATE_RELATIVE_PATH = path.join("data", "run-memory", "records.json");
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:run_memory_records";
const LegacyRunMemoryState = z.object({
  records: z.array(RunMemoryRecord).default([]),
});

export interface IRunMemoryRepo {
  list(): Promise<RunMemoryRecord[]>;
  getByRunId(runId: string): Promise<RunMemoryRecord | null>;
  upsert(record: RunMemoryRecord): Promise<void>;
}

export class SqliteRunMemoryRepo implements IRunMemoryRepo {
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
    await this.importLegacyRecordsOnce();
  }

  async list(): Promise<RunMemoryRecord[]> {
    await this.ensureReady();
    const rows = await this.prisma.runMemoryRecord.findMany({
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: 1000,
    });
    return rows.flatMap((row) => this.parseRecord(row.dataJson));
  }

  async getByRunId(runId: string): Promise<RunMemoryRecord | null> {
    await this.ensureReady();
    const row = await this.prisma.runMemoryRecord.findUnique({
      where: { runId },
      select: { dataJson: true },
    });
    return row ? this.parseRecord(row.dataJson)[0] ?? null : null;
  }

  async upsert(record: RunMemoryRecord): Promise<void> {
    await this.ensureReady();
    await this.upsertValidatedRecord(record);
  }

  private async upsertValidatedRecord(record: RunMemoryRecord): Promise<void> {
    await this.prisma.runMemoryRecord.upsert({
      where: { runId: record.runId },
      create: {
        id: record.id,
        runId: record.runId,
        agentId: record.agentId,
        title: record.firstUserMessage?.slice(0, 160) ?? null,
        summary: record.summary,
        kind: record.taskType ?? null,
        createdAt: new Date(record.createdAt),
        dataJson: JSON.stringify(record),
      },
      update: {
        id: record.id,
        agentId: record.agentId,
        title: record.firstUserMessage?.slice(0, 160) ?? null,
        summary: record.summary,
        kind: record.taskType ?? null,
        createdAt: new Date(record.createdAt),
        dataJson: JSON.stringify(record),
      },
    });
  }

  private async importLegacyRecordsOnce(): Promise<void> {
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
        const state = LegacyRunMemoryState.parse(JSON.parse(raw));
        for (const record of state.records) {
          await this.upsertValidatedRecord(record);
        }
      }
    } catch (error) {
      console.error("[SqliteRunMemoryRepo] Failed to import legacy records:", error);
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

  private parseRecord(dataJson: string): RunMemoryRecord[] {
    try {
      return [RunMemoryRecord.parse(JSON.parse(dataJson))];
    } catch (error) {
      console.error("[SqliteRunMemoryRepo] Failed to parse record:", error);
      return [];
    }
  }
}

