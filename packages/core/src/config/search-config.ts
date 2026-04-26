import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { WorkDir } from "./runtime-defaults.js";

export type QuickSearchProvider = "ddg-search" | "brave-search";

export interface SearchRuntimeConfig {
    defaultQuickSearchProvider: QuickSearchProvider;
}

const CONFIG_DIR = path.join(WorkDir, "config");
export const BRAVE_SEARCH_CONFIG_PATH = path.join(CONFIG_DIR, "brave-search.json");
export const EXA_SEARCH_CONFIG_PATH = path.join(CONFIG_DIR, "exa-search.json");
export const SEARCH_SETTINGS_CONFIG_PATH = path.join(CONFIG_DIR, "search-settings.json");

const DEFAULT_PROVIDER_CONFIG = { apiKey: "" };
const DEFAULT_SETTINGS: SearchRuntimeConfig = {
    defaultQuickSearchProvider: "ddg-search",
};

function normalizeSearchSettings(input: unknown): SearchRuntimeConfig {
    if (!input || typeof input !== "object") {
        return { ...DEFAULT_SETTINGS };
    }
    const candidate = input as Record<string, unknown>;
    const provider = candidate.defaultQuickSearchProvider;
    return {
        defaultQuickSearchProvider: provider === "brave-search" ? "brave-search" : "ddg-search",
    };
}

async function ensureProviderConfig(filePath: string): Promise<void> {
    try {
        await fsPromises.access(filePath);
    } catch {
        await fsPromises.writeFile(filePath, JSON.stringify(DEFAULT_PROVIDER_CONFIG, null, 2) + "\n", "utf8");
    }
}

function ensureSettingsSync(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(SEARCH_SETTINGS_CONFIG_PATH)) {
        fs.writeFileSync(SEARCH_SETTINGS_CONFIG_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n", "utf8");
    }
}

function readSettings(): SearchRuntimeConfig {
    ensureSettingsSync();
    try {
        const raw = fs.readFileSync(SEARCH_SETTINGS_CONFIG_PATH, "utf8");
        return normalizeSearchSettings(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export async function ensureSearchConfigs(): Promise<void> {
    await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
    await Promise.all([
        ensureProviderConfig(BRAVE_SEARCH_CONFIG_PATH),
        ensureProviderConfig(EXA_SEARCH_CONFIG_PATH),
    ]);

    try {
        await fsPromises.access(SEARCH_SETTINGS_CONFIG_PATH);
        await fsPromises.writeFile(
            SEARCH_SETTINGS_CONFIG_PATH,
            JSON.stringify(readSettings(), null, 2) + "\n",
            "utf8",
        );
    } catch {
        await fsPromises.writeFile(
            SEARCH_SETTINGS_CONFIG_PATH,
            JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n",
            "utf8",
        );
    }
}

export function getSearchConfig(): SearchRuntimeConfig {
    return readSettings();
}
