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
