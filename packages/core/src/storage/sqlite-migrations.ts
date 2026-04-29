import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPrismaClient,
  ensurePrismaDatabaseDirectory,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from "./prisma.js";

export type SqliteMigrationOptions = {
  prisma?: FlazzPrismaClient;
  storage?: PrismaStorageOptions;
  migrationsDir?: string;
};

const BUILTIN_MIGRATIONS = [
  {
    id: "20260428135600_init_sqlite_storage",
    sql: String.raw`
CREATE TABLE "schema_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applied_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "app_kv" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value_json" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agent_id" TEXT NOT NULL,
    "run_type" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "deleted_at" DATETIME,
    "last_event_seq" INTEGER NOT NULL DEFAULT 0,
    "metadata_json" TEXT
);

CREATE TABLE "run_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "subflow_json" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "data_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parent_message_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "content_preview" TEXT,
    "data_json" TEXT,
    CONSTRAINT "messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "message_parts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "text" TEXT,
    "data_json" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "message_parts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_parts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tool_calls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "message_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input_json" TEXT,
    "result_json" TEXT,
    "error" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tool_calls_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tool_calls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "run_permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "subflow_json" TEXT NOT NULL,
    "request_json" TEXT NOT NULL,
    "response" TEXT,
    "scope" TEXT,
    "requested_at" DATETIME NOT NULL,
    "responded_at" DATETIME,
    CONSTRAINT "run_permissions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "runs_type_updated_idx" ON "runs"("run_type", "updated_at", "id");
CREATE INDEX "runs_agent_updated_idx" ON "runs"("agent_id", "updated_at", "id");
CREATE INDEX "run_events_run_seq_idx" ON "run_events"("run_id", "seq");
CREATE INDEX "run_events_type_ts_idx" ON "run_events"("type", "ts");
CREATE UNIQUE INDEX "run_events_run_seq_unique" ON "run_events"("run_id", "seq");
CREATE INDEX "messages_run_created_idx" ON "messages"("run_id", "created_at", "id");
CREATE INDEX "messages_run_role_idx" ON "messages"("run_id", "role");
CREATE INDEX "message_parts_message_pos_idx" ON "message_parts"("message_id", "position");
CREATE INDEX "message_parts_run_type_idx" ON "message_parts"("run_id", "type");
CREATE UNIQUE INDEX "message_parts_message_position_unique" ON "message_parts"("message_id", "position");
CREATE INDEX "tool_calls_run_status_idx" ON "tool_calls"("run_id", "status");
CREATE INDEX "run_permissions_run_idx" ON "run_permissions"("run_id");
CREATE INDEX "run_permissions_pending_idx" ON "run_permissions"("run_id", "response");
`,
  },
  {
    id: "20260429120000_integration_idempotency",
    sql: String.raw`
CREATE TABLE "integration_idempotency" (
    "fingerprint" TEXT NOT NULL PRIMARY KEY,
    "app" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "data_json" TEXT
);

CREATE INDEX "integration_idempotency_created_idx" ON "integration_idempotency"("created_at");
`,
  },
  {
    id: "20260429121000_run_memory_records",
    sql: String.raw`
CREATE TABLE "run_memory_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT NOT NULL,
    "kind" TEXT,
    "created_at" DATETIME NOT NULL,
    "data_json" TEXT NOT NULL
);

CREATE UNIQUE INDEX "run_memory_records_run_id_unique" ON "run_memory_records"("run_id");
CREATE INDEX "run_memory_records_created_idx" ON "run_memory_records"("created_at");
CREATE INDEX "run_memory_records_agent_created_idx" ON "run_memory_records"("agent_id", "created_at");
`,
  },
  {
    id: "20260429122000_graph_signals",
    sql: String.raw`
CREATE TABLE "graph_signals" (
    "fingerprint" TEXT NOT NULL PRIMARY KEY,
    "occurred_at" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "object_type" TEXT,
    "object_id" TEXT,
    "confidence" REAL,
    "state" TEXT,
    "data_json" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE INDEX "graph_signals_occurred_idx" ON "graph_signals"("occurred_at");
CREATE INDEX "graph_signals_source_idx" ON "graph_signals"("source", "occurred_at");
`,
  },
  {
    id: "20260429123000_agent_schedule_state",
    sql: String.raw`
CREATE TABLE "agent_schedule_state" (
    "agent_name" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "started_at" TEXT,
    "last_run_at" TEXT,
    "next_run_at" TEXT,
    "last_error" TEXT,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL
);
`,
  },
  {
    id: "20260429124000_graph_sync_state",
    sql: String.raw`
CREATE TABLE "graph_sync_sources" (
    "source" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "last_read_at" TEXT,
    "last_signal_at" TEXT,
    "reads_today" INTEGER NOT NULL DEFAULT 0,
    "items_seen_today" INTEGER NOT NULL DEFAULT 0,
    "signals_today" INTEGER NOT NULL DEFAULT 0,
    "classification_calls_today" INTEGER NOT NULL DEFAULT 0,
    "distill_calls_today" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL,
    PRIMARY KEY ("source", "day")
);

CREATE TABLE "graph_sync_apps" (
    "app" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "last_list_read_at" TEXT,
    "last_detail_read_at" TEXT,
    "list_reads_today" INTEGER NOT NULL DEFAULT 0,
    "detail_reads_today" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "backoff_until" TEXT,
    "last_error" TEXT,
    "bootstrap_version" INTEGER,
    "bootstrap_completed_at" TEXT,
    "updated_at" DATETIME NOT NULL,
    PRIMARY KEY ("app", "source", "day")
);

CREATE TABLE "graph_sync_objects" (
    "app" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "last_seen_at" TEXT,
    "last_detail_at" TEXT,
    "last_fingerprint" TEXT,
    "updated_at" DATETIME NOT NULL,
    PRIMARY KEY ("app", "object_id")
);

CREATE INDEX "graph_sync_apps_lookup_idx" ON "graph_sync_apps"("app", "source", "day");
`,
  },
  {
    id: "20260429125000_skill_revisions",
    sql: String.raw`
CREATE TABLE "skill_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skill_path" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "run_id" TEXT,
    "summary" TEXT,
    "previous_content" TEXT,
    "next_content" TEXT NOT NULL
);

CREATE INDEX "skill_revisions_skill_created_idx" ON "skill_revisions"("skill_path", "created_at");
`,
  },
  {
    id: "20260429130000_email_labeling_state",
    sql: String.raw`
CREATE TABLE "email_labeling_files" (
    "path" TEXT NOT NULL PRIMARY KEY,
    "labeled_at" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "email_labeling_state" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "last_run_time" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
`,
  },
  {
    id: "20260429131000_skill_learning_state",
    sql: String.raw`
CREATE TABLE "skill_learning_candidates" (
    "signature" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confidence" REAL NOT NULL DEFAULT 0.25,
    "occurrences" INTEGER NOT NULL,
    "first_seen_at" TEXT NOT NULL,
    "last_seen_at" TEXT NOT NULL,
    "last_run_id" TEXT NOT NULL,
    "proposed_skill_name" TEXT,
    "proposed_category" TEXT,
    "proposed_description" TEXT,
    "draft_content" TEXT,
    "rationale" TEXT,
    "promoted_skill_name" TEXT,
    "related_skill_name" TEXT,
    "recent_run_ids_json" TEXT NOT NULL DEFAULT '[]',
    "intent_fingerprint" TEXT,
    "tool_sequence_fingerprint" TEXT,
    "output_shape" TEXT,
    "explicit_user_reuse_signal" BOOLEAN NOT NULL DEFAULT false,
    "complexity_score" REAL NOT NULL DEFAULT 0,
    "recurrence_score" REAL NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "skill_learning_stats" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "learned_from_runs" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TEXT,
    "last_learned_at" TEXT,
    "last_updated_at" TEXT,
    "last_failure_at" TEXT,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "skill_repair_candidates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skill_name" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failure_category" TEXT NOT NULL,
    "evidence_summary" TEXT NOT NULL,
    "proposed_patch" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

CREATE INDEX "skill_learning_candidates_status_seen_idx" ON "skill_learning_candidates"("status", "last_seen_at");
CREATE INDEX "skill_learning_candidates_fingerprint_idx" ON "skill_learning_candidates"("intent_fingerprint", "tool_sequence_fingerprint");
CREATE INDEX "skill_learning_candidates_related_idx" ON "skill_learning_candidates"("related_skill_name");
CREATE INDEX "skill_repair_candidates_skill_updated_idx" ON "skill_repair_candidates"("skill_name", "updated_at");
CREATE INDEX "skill_repair_candidates_status_updated_idx" ON "skill_repair_candidates"("status", "updated_at");
`,
  },
  {
    id: "20260429132000_memory_graph_state",
    sql: String.raw`
CREATE TABLE "memory_graph_processed_files" (
    "file_path" TEXT NOT NULL PRIMARY KEY,
    "mtime" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "last_processed" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "memory_graph_meta" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
`,
  },
  {
    id: "20260429133000_runtime_state_cleanup",
    sql: String.raw`
CREATE TABLE "composio_connected_accounts" (
    "toolkit_slug" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "auth_config_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "last_updated_at" TEXT NOT NULL,
    "data_json" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "prebuilt_runner_state" (
    "agent_name" TEXT NOT NULL PRIMARY KEY,
    "last_run_at" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "service_log_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT,
    "run_id" TEXT,
    "correlation_id" TEXT,
    "ts" DATETIME NOT NULL,
    "message" TEXT,
    "data_json" TEXT NOT NULL
);

CREATE INDEX "composio_connected_accounts_status_idx" ON "composio_connected_accounts"("status");
CREATE INDEX "service_log_events_service_ts_idx" ON "service_log_events"("service", "ts");
CREATE INDEX "service_log_events_run_ts_idx" ON "service_log_events"("run_id", "ts");
`,
  },
];

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveMigrationsDir(explicitDir?: string): Promise<string> {
  if (explicitDir) return explicitDir;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "..", "..", "prisma", "migrations"),
    path.resolve(process.cwd(), "prisma", "migrations"),
    path.resolve(process.cwd(), "packages", "core", "prisma", "migrations"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error(`Unable to locate Prisma migrations directory. Tried: ${candidates.join(", ")}`);
}

async function loadMigrations(migrationsDir?: string): Promise<Array<{ id: string; sql: string }>> {
  try {
    const resolvedMigrationsDir = await resolveMigrationsDir(migrationsDir);
    const entries = await fs.readdir(resolvedMigrationsDir, { withFileTypes: true });
    const migrationDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    return Promise.all(
      migrationDirs.map(async (migrationId) => ({
        id: migrationId,
        sql: await fs.readFile(path.join(resolvedMigrationsDir, migrationId, "migration.sql"), "utf8"),
      })),
    );
  } catch (error) {
    if (migrationsDir) throw error;
    return BUILTIN_MIGRATIONS;
  }
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function getAppliedMigrationIds(prisma: FlazzPrismaClient): Promise<Set<string>> {
  try {
    const rows = await prisma.schemaMigration.findMany({
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  } catch {
    return new Set();
  }
}

export async function applySqliteMigrations(options: SqliteMigrationOptions = {}): Promise<void> {
  await ensurePrismaDatabaseDirectory(options.storage);
  const prisma = options.prisma ?? createPrismaClient(options.storage);
  const shouldDisconnect = !options.prisma;

  try {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
    await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL");
    await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL");

    const migrations = await loadMigrations(options.migrationsDir);
    const applied = await getAppliedMigrationIds(prisma);

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;

      await prisma.$transaction(async (tx) => {
        for (const statement of splitSqlStatements(migration.sql)) {
          await tx.$executeRawUnsafe(statement);
        }
        await tx.schemaMigration.upsert({
          where: { id: migration.id },
          create: { id: migration.id },
          update: {},
        });
      });
      applied.add(migration.id);
    }
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}
