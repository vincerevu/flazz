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
