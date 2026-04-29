import crypto from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { IdGen } from "../application/lib/id-gen.js";
import { WorkDir } from "../config/config.js";
import type { ServiceEventType } from "@flazz/shared";
import { serviceBus } from "./service_bus.js";
import { createPrismaClient, type FlazzPrismaClient, type PrismaStorageOptions } from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";

type ServiceNameType = ServiceEventType["service"];
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type ServiceEventInput = DistributiveOmit<ServiceEventType, "ts">;
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:service_logs";
const LEGACY_LOG_RELATIVE_PATH = path.join("logs", "services.jsonl");

export type ServiceRunContext = {
    runId: string;
    correlationId: string;
    service: ServiceNameType;
    startedAt: number;
};

export class ServiceLogger {
    private idGen = new IdGen();
    private readonly prisma: FlazzPrismaClient;
    private readonly storage?: PrismaStorageOptions;
    private ready: Promise<void> | null = null;
    private writeQueue: Promise<void> = Promise.resolve();

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
        await this.importLegacyLogsOnce();
    }

    async log(event: ServiceEventInput & { correlationId?: string; [key: string]: unknown }): Promise<void> {
        const payload = {
            ...event,
            ts: new Date().toISOString(),
        } as ServiceEventType & { correlationId?: string; [key: string]: unknown };

        this.writeQueue = this.writeQueue.then(async () => {
            await this.ensureReady();
            await this.prisma.serviceLogEvent.create({
                data: {
                    id: await this.idGen.next(),
                    service: payload.service,
                    type: payload.type,
                    level: "level" in payload && typeof payload.level === "string" ? payload.level : null,
                    runId: "runId" in payload && typeof payload.runId === "string" ? payload.runId : null,
                    correlationId: typeof payload.correlationId === "string" ? payload.correlationId : null,
                    ts: new Date(payload.ts),
                    message: "message" in payload && typeof payload.message === "string" ? payload.message : null,
                    dataJson: JSON.stringify(payload),
                },
            });
            try {
                await serviceBus.publish(payload);
            } catch {
                // Ignore publish errors to avoid blocking log writes.
            }
        });

        return this.writeQueue;
    }

    async startRun(opts: {
        service: ServiceNameType;
        message: string;
        trigger?: "timer" | "manual" | "startup";
        config?: Record<string, unknown>;
        correlationId?: string;
    }): Promise<ServiceRunContext> {
        const runId = `${opts.service}_${await this.idGen.next()}`;
        const correlationId = opts.correlationId ?? crypto.randomUUID();
        const startedAt = Date.now();
        await this.log({
            type: "run_start",
            service: opts.service,
            runId,
            correlationId,
            level: "info",
            message: opts.message,
            trigger: opts.trigger,
            config: opts.config,
        });
        return { runId, correlationId, service: opts.service, startedAt };
    }

    private async importLegacyLogsOnce(): Promise<void> {
        const marker = await this.prisma.appKv.findUnique({ where: { key: LEGACY_IMPORT_MARKER_KEY } });
        if (marker) {
            return;
        }

        try {
            const legacyPath = this.legacyLogPath();
            if (!legacyPath) {
                return;
            }
            const raw = await fs.readFile(legacyPath, "utf8").catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return null;
                throw error;
            });
            if (!raw) {
                return;
            }

            const rows = raw
                .split(/\r?\n/)
                .filter((line) => line.trim().length > 0)
                .flatMap((line) => {
                    try {
                        const payload = JSON.parse(line) as Record<string, unknown>;
                        const ts = typeof payload.ts === "string" ? new Date(payload.ts) : new Date();
                        if (Number.isNaN(ts.getTime())) {
                            return [];
                        }
                        return [{
                            id: crypto.createHash("sha1").update(line).digest("hex"),
                            service: String(payload.service ?? "unknown"),
                            type: String(payload.type ?? "event"),
                            level: typeof payload.level === "string" ? payload.level : null,
                            runId: typeof payload.runId === "string" ? payload.runId : null,
                            correlationId: typeof payload.correlationId === "string" ? payload.correlationId : null,
                            ts,
                            message: typeof payload.message === "string" ? payload.message : null,
                            dataJson: JSON.stringify(payload),
                        }];
                    } catch {
                        return [];
                    }
                });

            for (let index = 0; index < rows.length; index += 500) {
                await this.prisma.serviceLogEvent.createMany({
                    data: rows.slice(index, index + 500),
                });
            }
        } catch (error) {
            console.error("[ServiceLogger] Failed to import legacy logs:", error);
        } finally {
            await this.prisma.appKv.upsert({
                where: { key: LEGACY_IMPORT_MARKER_KEY },
                create: { key: LEGACY_IMPORT_MARKER_KEY, valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
                update: { valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
            });
        }
    }

    private legacyLogPath(): string | null {
        if (this.storage?.databaseUrl && !this.storage.workDir) return null;
        return path.join(this.storage?.workDir ?? WorkDir, LEGACY_LOG_RELATIVE_PATH);
    }
}

export const serviceLogger = new ServiceLogger();
