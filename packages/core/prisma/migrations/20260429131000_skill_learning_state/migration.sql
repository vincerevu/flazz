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
