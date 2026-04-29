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
