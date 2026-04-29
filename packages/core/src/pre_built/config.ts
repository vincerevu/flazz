import fs from 'fs';
import path from 'path';
import { WorkDir } from '../config/config.js';
import {
    PreBuiltConfig,
    PreBuiltState,
    PreBuiltAgentConfig,
    UserConfig,
    PREBUILT_AGENTS,
} from './types.js';
import { createPrismaClient } from '../storage/prisma.js';
import { applySqliteMigrations } from '../storage/sqlite-migrations.js';

const CONFIG_PATH = path.join(WorkDir, 'config', 'prebuilt.json');
const USER_CONFIG_PATH = path.join(WorkDir, 'config', 'user.json');
const prisma = createPrismaClient();
let sqliteReady: Promise<void> | null = null;

function ensureSqliteReady(): Promise<void> {
    sqliteReady ??= applySqliteMigrations({ prisma });
    return sqliteReady;
}

function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function ensureConfigFile(): void {
    if (!fs.existsSync(CONFIG_PATH)) {
        ensureDir(path.dirname(CONFIG_PATH));
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(getDefaultConfig(), null, 2));
    }
}

// --- Config Management ---

export function getDefaultConfig(): PreBuiltConfig {
    const agents: Record<string, PreBuiltAgentConfig> = {};
    for (const agentName of PREBUILT_AGENTS) {
        agents[agentName] = {
            enabled: false,
            intervalMs: 5 * 60 * 1000, // 5 minutes
        };
    }
    return { agents };
}

export function loadConfig(): PreBuiltConfig {
    ensureConfigFile();
    try {
        const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(content);
        return PreBuiltConfig.parse(parsed);
    } catch (error) {
        console.error('[PreBuilt] Error loading config:', error);
        return getDefaultConfig();
    }
}

export function saveConfig(config: PreBuiltConfig): void {
    ensureDir(path.dirname(CONFIG_PATH));
    const validated = PreBuiltConfig.parse(config);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(validated, null, 2));
}

export function getAgentConfig(agentName: string): PreBuiltAgentConfig {
    const config = loadConfig();
    return config.agents[agentName] || { enabled: false, intervalMs: 5 * 60 * 1000 };
}

export function setAgentConfig(agentName: string, agentConfig: Partial<PreBuiltAgentConfig>): void {
    const config = loadConfig();
    config.agents[agentName] = {
        ...getAgentConfig(agentName),
        ...agentConfig,
    };
    saveConfig(config);
}

// --- State Management ---

export async function loadState(): Promise<PreBuiltState> {
    await ensureSqliteReady();
    const rows = await prisma.preBuiltRunnerState.findMany({
        orderBy: { agentName: 'asc' },
    });
    return PreBuiltState.parse({
        lastRunTimes: Object.fromEntries(rows.map((row) => [row.agentName, row.lastRunAt])),
    });
}

export async function saveState(state: PreBuiltState): Promise<void> {
    await ensureSqliteReady();
    const validated = PreBuiltState.parse(state);
    const entries = Object.entries(validated.lastRunTimes);
    if (entries.length === 0) {
        await prisma.preBuiltRunnerState.deleteMany();
        return;
    }
    const now = new Date();
    await prisma.$transaction([
        prisma.preBuiltRunnerState.deleteMany({
            where: { agentName: { notIn: entries.map(([agentName]) => agentName) } },
        }),
        ...entries.map(([agentName, lastRunAt]) =>
            prisma.preBuiltRunnerState.upsert({
                where: { agentName },
                create: { agentName, lastRunAt, updatedAt: now },
                update: { lastRunAt, updatedAt: now },
            }),
        ),
    ]);
}

export async function getLastRunTime(agentName: string): Promise<Date | null> {
    const state = await loadState();
    const timestamp = state.lastRunTimes[agentName];
    return timestamp ? new Date(timestamp) : null;
}

export async function setLastRunTime(agentName: string, time: Date): Promise<void> {
    await ensureSqliteReady();
    await prisma.preBuiltRunnerState.upsert({
        where: { agentName },
        create: { agentName, lastRunAt: time.toISOString(), updatedAt: new Date() },
        update: { lastRunAt: time.toISOString(), updatedAt: new Date() },
    });
}

export async function shouldRunAgent(agentName: string): Promise<boolean> {
    const config = getAgentConfig(agentName);
    if (!config.enabled) {
        return false;
    }

    const lastRun = await getLastRunTime(agentName);
    if (!lastRun) {
        return true; // Never run before
    }

    const elapsed = Date.now() - lastRun.getTime();
    return elapsed >= config.intervalMs;
}

// --- User Config Management ---

export function loadUserConfig(): UserConfig | null {
    try {
        if (fs.existsSync(USER_CONFIG_PATH)) {
            const content = fs.readFileSync(USER_CONFIG_PATH, 'utf-8');
            const parsed = JSON.parse(content);
            return UserConfig.parse(parsed);
        }
    } catch (error) {
        console.error('[PreBuilt] Error loading user config:', error);
    }
    return null;
}

export function saveUserConfig(config: UserConfig): void {
    ensureDir(path.dirname(USER_CONFIG_PATH));
    const validated = UserConfig.parse(config);
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(validated, null, 2));
}

export function getUserConfigPath(): string {
    return USER_CONFIG_PATH;
}
