import fs from "fs";
import path from "path";
import { WorkDir } from "./config.js";

export interface CompactionRuntimeConfig {
    auto: boolean;
    prune: boolean;
    reservedTokens?: number;
}

const CONFIG_FILE = path.join(WorkDir, "config", "compaction.json");

const DEFAULT_CONFIG: CompactionRuntimeConfig = {
    auto: true,
    prune: true,
};

let cachedConfig: CompactionRuntimeConfig | null = null;

function normalizeConfig(input: unknown): CompactionRuntimeConfig {
    if (!input || typeof input !== "object") {
        return { ...DEFAULT_CONFIG };
    }
    const candidate = input as Record<string, unknown>;
    const reservedTokens = typeof candidate.reservedTokens === "number"
        && Number.isInteger(candidate.reservedTokens)
        && candidate.reservedTokens >= 0
        ? candidate.reservedTokens
        : undefined;

    return {
        auto: candidate.auto !== false,
        prune: candidate.prune !== false,
        reservedTokens,
    };
}

function readConfig(): CompactionRuntimeConfig {
    if (cachedConfig) {
        return cachedConfig;
    }

    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            cachedConfig = { ...DEFAULT_CONFIG };
            return cachedConfig;
        }
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        cachedConfig = normalizeConfig(JSON.parse(raw));
        return cachedConfig;
    } catch {
        cachedConfig = { ...DEFAULT_CONFIG };
        return cachedConfig;
    }
}

function writeConfig(config: CompactionRuntimeConfig): void {
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    cachedConfig = { ...config };
}

export function ensureCompactionConfig(): void {
    if (!fs.existsSync(CONFIG_FILE)) {
        writeConfig(DEFAULT_CONFIG);
        return;
    }
    cachedConfig = null;
    writeConfig(readConfig());
}

export function getCompactionConfig(): CompactionRuntimeConfig {
    return readConfig();
}

