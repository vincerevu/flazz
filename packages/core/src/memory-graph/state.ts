import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import { WorkDir } from '../config/config.js';
import {
    createPrismaClient,
    type FlazzPrismaClient,
    type PrismaStorageOptions,
} from '../storage/prisma.js';
import { applySqliteMigrations } from '../storage/sqlite-migrations.js';

/**
 * State tracking for memory graph processing.
 * Uses mtime + hash hybrid approach to detect file changes.
 */

const LAST_BUILD_TIME_KEY = 'lastBuildTime';
const LEGACY_STATE_RELATIVE_PATH = 'memory_graph_state.json';
const LEGACY_IMPORT_MARKER_KEY = 'legacy_import:memory_graph_state';

export interface FileState {
    mtime: string; // ISO timestamp of last modification
    hash: string; // Content hash
    lastProcessed: string; // ISO timestamp of when it was processed
}

export interface GraphState {
    processedFiles: Record<string, FileState>; // filepath -> FileState
    lastBuildTime: string; // ISO timestamp of last successful build
}

const DEFAULT_STATE: GraphState = {
    processedFiles: {},
    lastBuildTime: new Date(0).toISOString(),
};

const LegacyFileState = z.object({
    mtime: z.string(),
    hash: z.string(),
    lastProcessed: z.string(),
});

const LegacyGraphState = z.object({
    processedFiles: z.record(z.string(), LegacyFileState).default({}),
    lastBuildTime: z.string().optional(),
});

class SqliteMemoryGraphStateRepo {
    private readonly prisma: FlazzPrismaClient;
    private readonly storage?: PrismaStorageOptions;
    private ready: Promise<void> | null = null;

    constructor(options: { prisma?: FlazzPrismaClient; storage?: PrismaStorageOptions } = {}) {
        this.storage = options.storage;
        this.prisma = options.prisma ?? createPrismaClient(options.storage);
    }

    private ensureReady(): Promise<void> {
        this.ready ??= this.initialize();
        return this.ready;
    }

    private async initialize(): Promise<void> {
        await applySqliteMigrations({ prisma: this.prisma, storage: this.storage });
        await this.importLegacyStateOnce();
    }

    async load(): Promise<GraphState> {
        await this.ensureReady();
        const [files, meta] = await Promise.all([
            this.prisma.memoryGraphProcessedFile.findMany(),
            this.prisma.memoryGraphMeta.findUnique({ where: { key: LAST_BUILD_TIME_KEY } }),
        ]);

        return {
            processedFiles: Object.fromEntries(
                files.map((file) => [
                    file.filePath,
                    {
                        mtime: file.mtime,
                        hash: file.hash,
                        lastProcessed: file.lastProcessed,
                    },
                ]),
            ),
            lastBuildTime: meta?.value ?? DEFAULT_STATE.lastBuildTime,
        };
    }

    async save(state: GraphState): Promise<void> {
        await this.ensureReady();
        await this.saveValidatedState(state);
    }

    private async saveValidatedState(state: GraphState): Promise<void> {
        const now = new Date();
        const entries = Object.entries(state.processedFiles);

        await this.prisma.$transaction(async (tx) => {
            await tx.memoryGraphMeta.upsert({
                where: { key: LAST_BUILD_TIME_KEY },
                create: {
                    key: LAST_BUILD_TIME_KEY,
                    value: state.lastBuildTime,
                    updatedAt: now,
                },
                update: {
                    value: state.lastBuildTime,
                    updatedAt: now,
                },
            });

            for (const [filePath, fileState] of entries) {
                await tx.memoryGraphProcessedFile.upsert({
                    where: { filePath },
                    create: {
                        filePath,
                        mtime: fileState.mtime,
                        hash: fileState.hash,
                        lastProcessed: fileState.lastProcessed,
                        updatedAt: now,
                    },
                    update: {
                        mtime: fileState.mtime,
                        hash: fileState.hash,
                        lastProcessed: fileState.lastProcessed,
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
            const raw = await fsp.readFile(legacyPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return null;
                throw error;
            });
            if (raw) {
                const legacy = LegacyGraphState.parse(JSON.parse(raw));
                await this.saveValidatedState({
                    processedFiles: legacy.processedFiles,
                    lastBuildTime: legacy.lastBuildTime ?? DEFAULT_STATE.lastBuildTime,
                });
            }
        } catch (error) {
            console.error('[SqliteMemoryGraphStateRepo] Failed to import legacy state:', error);
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

    async reset(): Promise<void> {
        await this.ensureReady();
        await this.prisma.$transaction([
            this.prisma.memoryGraphProcessedFile.deleteMany(),
            this.prisma.memoryGraphMeta.upsert({
                where: { key: LAST_BUILD_TIME_KEY },
                create: {
                    key: LAST_BUILD_TIME_KEY,
                    value: new Date().toISOString(),
                    updatedAt: new Date(),
                },
                update: {
                    value: new Date().toISOString(),
                    updatedAt: new Date(),
                },
            }),
        ]);
    }
}

const defaultRepo = new SqliteMemoryGraphStateRepo();

/**
 * Load the current state from SQLite.
 */
export async function loadState(): Promise<GraphState> {
    try {
        return await defaultRepo.load();
    } catch (error) {
        console.error('Error loading memory graph state:', error);
        return DEFAULT_STATE;
    }
}

/**
 * Save the current state to SQLite.
 */
export async function saveState(state: GraphState): Promise<void> {
    try {
        await defaultRepo.save(state);
    } catch (error) {
        console.error('Error saving memory graph state:', error);
        throw error;
    }
}

/**
 * Compute hash of file content.
 */
export function computeFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check if a file has changed since it was last processed.
 * Uses mtime for quick check, then hash for verification.
 */
export function hasFileChanged(filePath: string, state: GraphState): boolean {
    const fileState = state.processedFiles[filePath];

    if (!fileState) {
        return true;
    }

    const stats = fs.statSync(filePath);
    const currentMtime = stats.mtime.toISOString();

    if (currentMtime === fileState.mtime) {
        return false;
    }

    const currentHash = computeFileHash(filePath);
    return currentHash !== fileState.hash;
}

/**
 * Update state after processing a file.
 */
export function markFileAsProcessed(filePath: string, state: GraphState): void {
    const stats = fs.statSync(filePath);
    const hash = computeFileHash(filePath);

    state.processedFiles[filePath] = {
        mtime: stats.mtime.toISOString(),
        hash,
        lastProcessed: new Date().toISOString(),
    };
}

/**
 * Get list of files that need processing from a source directory.
 * Returns only new or changed files, recursively traversing subdirectories.
 */
export function getFilesToProcess(
    sourceDir: string,
    state: GraphState
): string[] {
    if (!fs.existsSync(sourceDir)) {
        return [];
    }

    const filesToProcess: string[] = [];

    function traverseDirectory(dir: string) {
        const entries = fs.readdirSync(dir);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                traverseDirectory(fullPath);
            } else if (stat.isFile() && entry.endsWith('.md')) {
                if (hasFileChanged(fullPath, state)) {
                    filesToProcess.push(fullPath);
                }
            }
        }
    }

    traverseDirectory(sourceDir);
    return filesToProcess;
}

/**
 * Reset state - useful for reprocessing everything.
 */
export async function resetState(): Promise<void> {
    await defaultRepo.reset();
}
