import fs from "node:fs/promises";
import path from "node:path";
import { ZLocalConnectedAccount, LocalConnectedAccount, ConnectedAccountStatus } from "./types.js";
import {
    createPrismaClient,
    type FlazzPrismaClient,
    type PrismaStorageOptions,
} from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";
import { WorkDir } from "../config/config.js";

const LEGACY_CONNECTED_ACCOUNTS_PATH = path.join(WorkDir, "data", "composio", "connected_accounts.json");
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:composio_connected_accounts";

export interface IComposioAccountsRepo {
    getAccount(toolkitSlug: string): Promise<LocalConnectedAccount | null>;
    getAllAccounts(): Promise<Record<string, LocalConnectedAccount>>;
    saveAccount(account: LocalConnectedAccount): Promise<void>;
    updateAccountStatus(toolkitSlug: string, status: ConnectedAccountStatus): Promise<boolean>;
    deleteAccount(toolkitSlug: string): Promise<void>;
    isConnected(toolkitSlug: string): Promise<boolean>;
    getConnectedToolkits(): Promise<string[]>;
}

export class ComposioAccountsRepo implements IComposioAccountsRepo {
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
        await this.importLegacyAccountsOnce();
    }

    async getAccount(toolkitSlug: string): Promise<LocalConnectedAccount | null> {
        await this.ensureReady();
        const row = await this.prisma.composioConnectedAccount.findUnique({
            where: { toolkitSlug },
            select: { dataJson: true },
        });
        return row ? this.parseAccount(row.dataJson) : null;
    }

    async getAllAccounts(): Promise<Record<string, LocalConnectedAccount>> {
        await this.ensureReady();
        const rows = await this.prisma.composioConnectedAccount.findMany({
            orderBy: { toolkitSlug: "asc" },
            select: { toolkitSlug: true, dataJson: true },
        });
        return Object.fromEntries(
            rows.flatMap((row) => {
                const account = this.parseAccount(row.dataJson);
                return account ? [[row.toolkitSlug, account] as const] : [];
            }),
        );
    }

    async saveAccount(account: LocalConnectedAccount): Promise<void> {
        await this.ensureReady();
        const validated = ZLocalConnectedAccount.parse(account);
        await this.upsertValidatedAccount(validated);
    }

    async updateAccountStatus(toolkitSlug: string, status: ConnectedAccountStatus): Promise<boolean> {
        const account = await this.getAccount(toolkitSlug);
        if (!account) {
            console.warn(`[ComposioRepo] Cannot update status: account '${toolkitSlug}' not found`);
            return false;
        }
        await this.saveAccount({
            ...account,
            status,
            lastUpdatedAt: new Date().toISOString(),
        });
        return true;
    }

    async deleteAccount(toolkitSlug: string): Promise<void> {
        await this.ensureReady();
        await this.prisma.composioConnectedAccount.deleteMany({
            where: { toolkitSlug },
        });
    }

    async isConnected(toolkitSlug: string): Promise<boolean> {
        const account = await this.getAccount(toolkitSlug);
        return account?.status === "ACTIVE";
    }

    async getConnectedToolkits(): Promise<string[]> {
        await this.ensureReady();
        const rows = await this.prisma.composioConnectedAccount.findMany({
            where: { status: "ACTIVE" },
            orderBy: { toolkitSlug: "asc" },
            select: { toolkitSlug: true },
        });
        return rows.map((row) => row.toolkitSlug);
    }

    private parseAccount(dataJson: string): LocalConnectedAccount | null {
        try {
            return ZLocalConnectedAccount.parse(JSON.parse(dataJson));
        } catch (error) {
            console.error("[ComposioRepo] Failed to parse account:", error);
            return null;
        }
    }

    private async importLegacyAccountsOnce(): Promise<void> {
        const marker = await this.prisma.appKv.findUnique({
            where: { key: LEGACY_IMPORT_MARKER_KEY },
            select: { key: true },
        });
        if (marker) {
            return;
        }

        let imported = 0;
        try {
            const raw = await fs.readFile(LEGACY_CONNECTED_ACCOUNTS_PATH, "utf8");
            const parsed = JSON.parse(raw) as { accounts?: Record<string, unknown> };
            const accounts = parsed.accounts && typeof parsed.accounts === "object"
                ? Object.values(parsed.accounts)
                : [];
            for (const candidate of accounts) {
                const result = ZLocalConnectedAccount.safeParse(candidate);
                if (!result.success) {
                    console.warn("[ComposioRepo] Skipping invalid legacy connected account");
                    continue;
                }
                await this.upsertValidatedAccount(result.data);
                imported += 1;
            }
        } catch (error) {
            const code = typeof error === "object" && error && "code" in error
                ? String((error as { code?: unknown }).code)
                : "";
            if (code !== "ENOENT") {
                console.error("[ComposioRepo] Failed to import legacy connected accounts:", error);
            }
        }

        await this.prisma.appKv.upsert({
            where: { key: LEGACY_IMPORT_MARKER_KEY },
            create: {
                key: LEGACY_IMPORT_MARKER_KEY,
                valueJson: JSON.stringify({
                    imported,
                    source: LEGACY_CONNECTED_ACCOUNTS_PATH,
                    importedAt: new Date().toISOString(),
                }),
            },
            update: {},
        });
    }

    private async upsertValidatedAccount(validated: LocalConnectedAccount): Promise<void> {
        await this.prisma.composioConnectedAccount.upsert({
            where: { toolkitSlug: validated.toolkitSlug },
            create: {
                toolkitSlug: validated.toolkitSlug,
                accountId: validated.id,
                authConfigId: validated.authConfigId,
                status: validated.status,
                createdAt: validated.createdAt,
                lastUpdatedAt: validated.lastUpdatedAt,
                dataJson: JSON.stringify(validated),
                updatedAt: new Date(),
            },
            update: {
                accountId: validated.id,
                authConfigId: validated.authConfigId,
                status: validated.status,
                createdAt: validated.createdAt,
                lastUpdatedAt: validated.lastUpdatedAt,
                dataJson: JSON.stringify(validated),
                updatedAt: new Date(),
            },
        });
    }
}

export const composioAccountsRepo = new ComposioAccountsRepo();
