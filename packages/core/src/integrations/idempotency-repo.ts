import crypto from "node:crypto";
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

const LEGACY_STATE_RELATIVE_PATH = path.join("data", "integrations", "idempotency.json");
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:integration_idempotency";
const LegacyIdempotencyRecord = z.object({
  fingerprint: z.string(),
  createdAt: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
});
const LegacyIdempotencyState = z.object({
  records: z.array(LegacyIdempotencyRecord).default([]),
});

function fingerprint(input: Record<string, unknown>) {
  return crypto.createHash("sha1").update(JSON.stringify(input)).digest("hex");
}

export interface IIntegrationIdempotencyRepo {
  wasRecentlySeen(input: Record<string, unknown>, windowMs?: number): Promise<boolean>;
  record(input: Record<string, unknown>): Promise<void>;
}

export class SqliteIntegrationIdempotencyRepo implements IIntegrationIdempotencyRepo {
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

  async wasRecentlySeen(input: Record<string, unknown>, windowMs = 5 * 60 * 1000): Promise<boolean> {
    await this.ensureReady();
    const cutoff = new Date(Date.now() - windowMs);
    await this.prisma.integrationIdempotency.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const existing = await this.prisma.integrationIdempotency.findUnique({
      where: { fingerprint: fingerprint(input) },
      select: { fingerprint: true },
    });
    return !!existing;
  }

  async record(input: Record<string, unknown>): Promise<void> {
    await this.ensureReady();
    await this.upsertRecord(input, new Date());
  }

  private async upsertRecord(input: Record<string, unknown>, createdAt: Date): Promise<void> {
    await this.prisma.integrationIdempotency.upsert({
      where: { fingerprint: fingerprint(input) },
      create: {
        fingerprint: fingerprint(input),
        app: String(input.app ?? ""),
        capability: String(input.capability ?? ""),
        createdAt,
        dataJson: JSON.stringify(input),
      },
      update: {
        app: String(input.app ?? ""),
        capability: String(input.capability ?? ""),
        createdAt,
        dataJson: JSON.stringify(input),
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
        const state = LegacyIdempotencyState.parse(JSON.parse(raw));
        for (const record of state.records) {
          const input = record.input ?? { fingerprint: record.fingerprint };
          await this.prisma.integrationIdempotency.upsert({
            where: { fingerprint: record.fingerprint },
            create: {
              fingerprint: record.fingerprint,
              app: String(input.app ?? ""),
              capability: String(input.capability ?? ""),
              createdAt: new Date(record.createdAt),
              dataJson: JSON.stringify(input),
            },
            update: {
              app: String(input.app ?? ""),
              capability: String(input.capability ?? ""),
              createdAt: new Date(record.createdAt),
              dataJson: JSON.stringify(input),
            },
          });
        }
      }
    } catch (error) {
      console.error("[SqliteIntegrationIdempotencyRepo] Failed to import legacy records:", error);
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
}
