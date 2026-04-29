import fs from "node:fs/promises";
import path from "node:path";
import { AgentScheduleState, AgentScheduleStateEntry } from "@flazz/shared";
import z from "zod";
import { WorkDir } from "../config/config.js";
import {
    createPrismaClient,
    type FlazzPrismaClient,
    type PrismaStorageOptions,
} from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";

const LEGACY_STATE_RELATIVE_PATH = path.join("config", "agent-schedule-state.json");
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:agent_schedule_state";

export interface IAgentScheduleStateRepo {
    ensureState(): Promise<void>;
    getState(): Promise<z.infer<typeof AgentScheduleState>>;
    getAgentState(agentName: string): Promise<z.infer<typeof AgentScheduleStateEntry> | null>;
    updateAgentState(agentName: string, entry: Partial<z.infer<typeof AgentScheduleStateEntry>>): Promise<void>;
    setAgentState(agentName: string, entry: z.infer<typeof AgentScheduleStateEntry>): Promise<void>;
    deleteAgentState(agentName: string): Promise<void>;
}

export class SqliteAgentScheduleStateRepo implements IAgentScheduleStateRepo {
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

    async ensureState(): Promise<void> {
        await this.ensureReady();
    }

    async getState(): Promise<z.infer<typeof AgentScheduleState>> {
        await this.ensureReady();
        const rows = await this.prisma.agentScheduleState.findMany({
            orderBy: { agentName: "asc" },
        });
        const agents: z.infer<typeof AgentScheduleState>["agents"] = {};
        for (const row of rows) {
            agents[row.agentName] = AgentScheduleStateEntry.parse({
                status: row.status,
                startedAt: row.startedAt,
                lastRunAt: row.lastRunAt,
                nextRunAt: row.nextRunAt,
                lastError: row.lastError,
                runCount: row.runCount,
            });
        }
        return AgentScheduleState.parse({ agents });
    }

    async getAgentState(agentName: string): Promise<z.infer<typeof AgentScheduleStateEntry> | null> {
        await this.ensureReady();
        const row = await this.prisma.agentScheduleState.findUnique({
            where: { agentName },
        });
        return row
            ? AgentScheduleStateEntry.parse({
                status: row.status,
                startedAt: row.startedAt,
                lastRunAt: row.lastRunAt,
                nextRunAt: row.nextRunAt,
                lastError: row.lastError,
                runCount: row.runCount,
            })
            : null;
    }

    async updateAgentState(agentName: string, entry: Partial<z.infer<typeof AgentScheduleStateEntry>>): Promise<void> {
        const existing = await this.getAgentState(agentName) ?? {
            status: "scheduled" as const,
            startedAt: null,
            lastRunAt: null,
            nextRunAt: null,
            lastError: null,
            runCount: 0,
        };
        await this.setAgentState(agentName, { ...existing, ...entry });
    }

    async setAgentState(agentName: string, entry: z.infer<typeof AgentScheduleStateEntry>): Promise<void> {
        await this.ensureReady();
        await this.upsertValidatedAgentState(agentName, entry);
    }

    private async upsertValidatedAgentState(agentName: string, entry: z.infer<typeof AgentScheduleStateEntry>): Promise<void> {
        const parsed = AgentScheduleStateEntry.parse(entry);
        await this.prisma.agentScheduleState.upsert({
            where: { agentName },
            create: {
                agentName,
                status: parsed.status,
                startedAt: parsed.startedAt,
                lastRunAt: parsed.lastRunAt,
                nextRunAt: parsed.nextRunAt,
                lastError: parsed.lastError,
                runCount: parsed.runCount,
                updatedAt: new Date(),
            },
            update: {
                status: parsed.status,
                startedAt: parsed.startedAt,
                lastRunAt: parsed.lastRunAt,
                nextRunAt: parsed.nextRunAt,
                lastError: parsed.lastError,
                runCount: parsed.runCount,
                updatedAt: new Date(),
            },
        });
    }

    async deleteAgentState(agentName: string): Promise<void> {
        await this.ensureReady();
        await this.prisma.agentScheduleState.delete({ where: { agentName } }).catch(() => undefined);
    }

    private ensureReady(): Promise<void> {
        this.ready ??= this.initialize();
        return this.ready;
    }

    private async initialize(): Promise<void> {
        await applySqliteMigrations({ prisma: this.prisma, storage: this.storage });
        await this.importLegacyStateOnce();
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
                const state = AgentScheduleState.parse(JSON.parse(raw));
                for (const [agentName, entry] of Object.entries(state.agents)) {
                    await this.upsertValidatedAgentState(agentName, entry);
                }
            }
        } catch (error) {
            console.error("[SqliteAgentScheduleStateRepo] Failed to import legacy state:", error);
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
