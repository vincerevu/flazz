import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";
import { SqliteIntegrationIdempotencyRepo } from "../idempotency-repo.js";

test("SqliteIntegrationIdempotencyRepo records and expires write fingerprints", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-idempotency-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));
  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteIntegrationIdempotencyRepo({
    prisma,
    storage: { databaseUrl },
  });

  try {
    const payload = {
      app: "github",
      capability: "comment",
      itemId: "issue-1",
      content: "Looks good",
    };

    assert.equal(await repo.wasRecentlySeen(payload), false);
    await repo.record(payload);
    assert.equal(await repo.wasRecentlySeen(payload), true);

    await prisma.integrationIdempotency.updateMany({
      data: { createdAt: new Date("2026-04-28T01:00:00.000Z") },
    });

    assert.equal(await repo.wasRecentlySeen(payload, 1), false);
    assert.equal(await prisma.integrationIdempotency.count(), 0);
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
