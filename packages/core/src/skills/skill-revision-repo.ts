import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { WorkDir } from '../config/config.js';
import {
  createPrismaClient,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from '../storage/prisma.js';
import { applySqliteMigrations } from '../storage/sqlite-migrations.js';

const SkillRevisionEntry = z.object({
  id: z.string(),
  createdAt: z.string(),
  reason: z.string(),
  actor: z.enum(['system', 'agent', 'user']),
  runId: z.string().optional(),
  summary: z.string().optional(),
  previousContent: z.string().optional(),
  nextContent: z.string(),
});

const LEGACY_IMPORT_MARKER_KEY = 'legacy_import:skill_revisions';
const LEGACY_SKILLS_RELATIVE_DIR = path.join('memory', 'Skills');

export type SkillRevisionEntry = z.infer<typeof SkillRevisionEntry>;

export interface ISkillRevisionRepo {
  appendRevision(
    skillPath: string,
    revision: Omit<SkillRevisionEntry, 'id' | 'createdAt'>,
  ): Promise<SkillRevisionEntry>;
  listRevisions(skillPath: string): Promise<SkillRevisionEntry[]>;
  getRevision(skillPath: string, revisionId: string): Promise<SkillRevisionEntry | null>;
}

export class SqliteSkillRevisionRepo implements ISkillRevisionRepo {
  private readonly prisma: FlazzPrismaClient;
  private readonly storage?: PrismaStorageOptions;
  private readonly ownsPrisma: boolean;
  private ready: Promise<void> | null = null;
  private lastCreatedAtMs = 0;

  constructor({
    prisma,
    storage,
  }: {
    prisma?: FlazzPrismaClient;
    storage?: PrismaStorageOptions;
  } = {}) {
    this.storage = storage;
    this.ownsPrisma = !prisma;
    this.prisma = prisma ?? createPrismaClient(storage);
  }

  private ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    return this.ready;
  }

  private async initialize(): Promise<void> {
    await applySqliteMigrations({ prisma: this.prisma, storage: this.storage });
    await this.importLegacyRevisionsOnce();
  }

  async appendRevision(
    skillPath: string,
    revision: Omit<SkillRevisionEntry, 'id' | 'createdAt'>,
  ): Promise<SkillRevisionEntry> {
    try {
      await this.ensureReady();
      const createdAtMs = Math.max(Date.now(), this.lastCreatedAtMs + 1);
      this.lastCreatedAtMs = createdAtMs;
      const fullRevision: SkillRevisionEntry = {
        id: randomUUID(),
        createdAt: new Date(createdAtMs).toISOString(),
        ...revision,
      };

      await this.prisma.skillRevision.create({
        data: {
          id: fullRevision.id,
          skillPath,
          createdAt: new Date(fullRevision.createdAt),
          reason: fullRevision.reason,
          actor: fullRevision.actor,
          runId: fullRevision.runId ?? null,
          summary: fullRevision.summary ?? null,
          previousContent: fullRevision.previousContent ?? null,
          nextContent: fullRevision.nextContent,
        },
      });

      return fullRevision;
    } finally {
      await this.disconnectIfOwned();
    }
  }

  async listRevisions(skillPath: string): Promise<SkillRevisionEntry[]> {
    try {
      await this.ensureReady();
      const rows = await this.prisma.skillRevision.findMany({
        where: { skillPath },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });

      return rows.map((row) => SkillRevisionEntry.parse({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        reason: row.reason,
        actor: row.actor,
        runId: row.runId ?? undefined,
        summary: row.summary ?? undefined,
        previousContent: row.previousContent ?? undefined,
        nextContent: row.nextContent,
      }));
    } finally {
      await this.disconnectIfOwned();
    }
  }

  async getRevision(skillPath: string, revisionId: string): Promise<SkillRevisionEntry | null> {
    try {
      await this.ensureReady();
      const row = await this.prisma.skillRevision.findFirst({
        where: {
          id: revisionId,
          skillPath,
        },
      });
      if (!row) return null;

      return SkillRevisionEntry.parse({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        reason: row.reason,
        actor: row.actor,
        runId: row.runId ?? undefined,
        summary: row.summary ?? undefined,
        previousContent: row.previousContent ?? undefined,
        nextContent: row.nextContent,
      });
    } finally {
      await this.disconnectIfOwned();
    }
  }

  private async disconnectIfOwned(): Promise<void> {
    if (this.ownsPrisma) {
      await this.prisma.$disconnect();
    }
  }

  private async importLegacyRevisionsOnce(): Promise<void> {
    const marker = await this.prisma.appKv.findUnique({ where: { key: LEGACY_IMPORT_MARKER_KEY } });
    if (marker) {
      return;
    }

    try {
      const skillsDir = this.legacySkillsDir();
      if (!skillsDir) {
        return;
      }
      const revisionFiles = await this.findLegacyRevisionFiles(skillsDir);
      for (const filePath of revisionFiles) {
        const raw = await fs.readFile(filePath, 'utf8');
        const revision = SkillRevisionEntry.parse(JSON.parse(raw));
        const skillPath = path.dirname(path.dirname(filePath));
        await this.prisma.skillRevision.upsert({
          where: { id: revision.id },
          create: {
            id: revision.id,
            skillPath,
            createdAt: new Date(revision.createdAt),
            reason: revision.reason,
            actor: revision.actor,
            runId: revision.runId ?? null,
            summary: revision.summary ?? null,
            previousContent: revision.previousContent ?? null,
            nextContent: revision.nextContent,
          },
          update: {
            skillPath,
            createdAt: new Date(revision.createdAt),
            reason: revision.reason,
            actor: revision.actor,
            runId: revision.runId ?? null,
            summary: revision.summary ?? null,
            previousContent: revision.previousContent ?? null,
            nextContent: revision.nextContent,
          },
        });
      }
    } catch (error) {
      console.error('[SqliteSkillRevisionRepo] Failed to import legacy revisions:', error);
    } finally {
      await this.prisma.appKv.upsert({
        where: { key: LEGACY_IMPORT_MARKER_KEY },
        create: { key: LEGACY_IMPORT_MARKER_KEY, valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
        update: { valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
      });
    }
  }

  private legacySkillsDir(): string | null {
    if (this.storage?.databaseUrl && !this.storage.workDir) return null;
    return path.join(this.storage?.workDir ?? WorkDir, LEGACY_SKILLS_RELATIVE_DIR);
  }

  private async findLegacyRevisionFiles(rootDir: string): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.json') && path.basename(dir) === '.revisions') {
          files.push(entryPath);
        }
      }
    }

    await walk(rootDir);
    return files;
  }
}

export { SqliteSkillRevisionRepo as SkillRevisionRepo };
