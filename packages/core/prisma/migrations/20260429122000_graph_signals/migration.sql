-- CreateTable
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

-- CreateIndex
CREATE INDEX "graph_signals_occurred_idx" ON "graph_signals"("occurred_at");

-- CreateIndex
CREATE INDEX "graph_signals_source_idx" ON "graph_signals"("source", "occurred_at");
