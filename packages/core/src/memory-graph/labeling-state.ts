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

const STATE_KEY = 'email_labeling';
const LEGACY_STATE_RELATIVE_PATH = 'labeling_state.json';
const LEGACY_IMPORT_MARKER_KEY = 'legacy_import:email_labeling_state';
const LegacyLabelingState = z.object({
    processedFiles: z.record(z.string(), z.object({ labeledAt: z.string() })).default({}),
    lastRunTime: z.string().optional(),
});

export interface LabelingState {
    processedFiles: Record<string, { labeledAt: string }>;
    lastRunTime: string;
}

export interface ILabelingStateRepo {
    load(): Promise<LabelingState>;
    save(state: LabelingState): Promise<void>;
    reset(): Promise<void>;
}

export class SqliteLabelingStateRepo implements ILabelingStateRepo {
    private readonly prisma: FlazzPrismaClient;
    private readonly storage?: PrismaStorageOptions;
    private readonly ownsPrisma: boolean;
    private ready: Promise<void> | null = null;

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
        await this.importLegacyStateOnce();
    }

    async load(): Promise<LabelingState> {
        try {
            await this.ensureReady();
            const [stateRow, fileRows] = await Promise.all([
                this.prisma.emailLabelingState.findUnique({ where: { key: STATE_KEY } }),
                this.prisma.emailLabelingFile.findMany(),
            ]);

            return {
                processedFiles: Object.fromEntries(
                    fileRows.map((row) => [row.path, { labeledAt: row.labeledAt }]),
                ),
                lastRunTime: stateRow?.lastRunTime ?? new Date(0).toISOString(),
            };
        } finally {
            await this.disconnectIfOwned();
        }
    }

    async save(state: LabelingState): Promise<void> {
        try {
            await this.ensureReady();
            await this.saveValidatedState(state);
        } finally {
            await this.disconnectIfOwned();
        }
    }

    async reset(): Promise<void> {
        try {
            await this.ensureReady();
            const now = new Date();
            await this.prisma.$transaction([
                this.prisma.emailLabelingFile.deleteMany(),
                this.prisma.emailLabelingState.upsert({
                    where: { key: STATE_KEY },
                    create: {
                        key: STATE_KEY,
                        lastRunTime: now.toISOString(),
                        updatedAt: now,
                    },
                    update: {
                        lastRunTime: now.toISOString(),
                        updatedAt: now,
                    },
                }),
            ]);
        } finally {
            await this.disconnectIfOwned();
        }
    }

    private async disconnectIfOwned(): Promise<void> {
        if (this.ownsPrisma) {
            await this.prisma.$disconnect();
        }
    }

    private async saveValidatedState(state: LabelingState): Promise<void> {
        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
            await tx.emailLabelingState.upsert({
                where: { key: STATE_KEY },
                create: {
                    key: STATE_KEY,
                    lastRunTime: state.lastRunTime,
                    updatedAt: now,
                },
                update: {
                    lastRunTime: state.lastRunTime,
                    updatedAt: now,
                },
            });

            for (const [filePath, fileState] of Object.entries(state.processedFiles)) {
                await tx.emailLabelingFile.upsert({
                    where: { path: filePath },
                    create: {
                        path: filePath,
                        labeledAt: fileState.labeledAt,
                        updatedAt: now,
                    },
                    update: {
                        labeledAt: fileState.labeledAt,
                        updatedAt: now,
                    },
                });
            }
        });
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
            const raw = await fs.readFile(legacyPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return null;
                throw error;
            });
            if (raw) {
                const legacy = LegacyLabelingState.parse(JSON.parse(raw));
                await this.saveValidatedState({
                    processedFiles: legacy.processedFiles,
                    lastRunTime: legacy.lastRunTime ?? new Date(0).toISOString(),
                });
            }
        } catch (error) {
            console.error('[SqliteLabelingStateRepo] Failed to import legacy state:', error);
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

const defaultRepo = new SqliteLabelingStateRepo();

export function loadLabelingState(): Promise<LabelingState> {
    return defaultRepo.load();
}

export function saveLabelingState(state: LabelingState): Promise<void> {
    return defaultRepo.save(state);
}

export function markFileAsLabeled(filePath: string, state: LabelingState): void {
    state.processedFiles[filePath] = {
        labeledAt: new Date().toISOString(),
    };
}

export function resetLabelingState(): Promise<void> {
    return defaultRepo.reset();
}
