-- CreateTable
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
