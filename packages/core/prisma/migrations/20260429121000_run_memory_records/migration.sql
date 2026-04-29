-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "run_memory_records_run_id_unique" ON "run_memory_records"("run_id");

-- CreateIndex
CREATE INDEX "run_memory_records_created_idx" ON "run_memory_records"("created_at");

-- CreateIndex
CREATE INDEX "run_memory_records_agent_created_idx" ON "run_memory_records"("agent_id", "created_at");
