import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";
import { WorkDir } from "../config/runtime-defaults.js";

export type FlazzPrismaClient = InstanceType<typeof PrismaClient>;

export type PrismaStorageOptions = {
  workDir?: string;
  databaseUrl?: string;
};

export function getDefaultDatabasePath(workDir = WorkDir): string {
  return path.join(workDir, "data", "flazz.db");
}

export function toPrismaSqliteUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

export function getPrismaDatabaseUrl(options: PrismaStorageOptions = {}): string {
  return options.databaseUrl
    ?? process.env.FLAZZ_DATABASE_URL
    ?? toPrismaSqliteUrl(getDefaultDatabasePath(options.workDir));
}

export async function ensurePrismaDatabaseDirectory(options: PrismaStorageOptions = {}): Promise<void> {
  const databaseUrl = getPrismaDatabaseUrl(options);
  if (databaseUrl === "file::memory:" || databaseUrl === ":memory:") return;
  const databasePath = databaseUrl.replace(/^file:/, "");
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
}

export function createPrismaClient(options: PrismaStorageOptions = {}): FlazzPrismaClient {
  const url = getPrismaDatabaseUrl(options);
  const adapter = new PrismaBetterSqlite3(
    { url },
    { timestampFormat: "iso8601" },
  );
  return new PrismaClient({ adapter });
}

