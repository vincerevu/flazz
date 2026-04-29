-- CreateTable
CREATE TABLE "schema_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applied_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "app_kv" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value_json" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX "runs_type_updated_idx" ON "runs"("run_type", "updated_at", "id");

-- CreateIndex
CREATE INDEX "runs_agent_updated_idx" ON "runs"("agent_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "run_events_run_seq_idx" ON "run_events"("run_id", "seq");

-- CreateIndex
CREATE INDEX "run_events_type_ts_idx" ON "run_events"("type", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "run_events_run_seq_unique" ON "run_events"("run_id", "seq");

-- CreateIndex
CREATE INDEX "messages_run_created_idx" ON "messages"("run_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "messages_run_role_idx" ON "messages"("run_id", "role");

-- CreateIndex
CREATE INDEX "message_parts_message_pos_idx" ON "message_parts"("message_id", "position");

-- CreateIndex
CREATE INDEX "message_parts_run_type_idx" ON "message_parts"("run_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "message_parts_message_position_unique" ON "message_parts"("message_id", "position");

-- CreateIndex
CREATE INDEX "tool_calls_run_status_idx" ON "tool_calls"("run_id", "status");

-- CreateIndex
CREATE INDEX "run_permissions_run_idx" ON "run_permissions"("run_id");

-- CreateIndex
CREATE INDEX "run_permissions_pending_idx" ON "run_permissions"("run_id", "response");
