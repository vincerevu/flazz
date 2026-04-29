-- CreateTable
CREATE TABLE "integration_idempotency" (
    "fingerprint" TEXT NOT NULL PRIMARY KEY,
    "app" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "data_json" TEXT
);

-- CreateIndex
CREATE INDEX "integration_idempotency_created_idx" ON "integration_idempotency"("created_at");
