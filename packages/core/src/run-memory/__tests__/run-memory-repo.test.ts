import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";
import { SqliteRunMemoryRepo } from "../run-memory-repo.js";

test("SqliteRunMemoryRepo upserts and lists run memory records", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-run-memory-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));
  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteRunMemoryRepo({
    prisma,
    storage: { databaseUrl },
  });

  try {
    await repo.upsert({
      id: "memory-1",
      runId: "run-1",
      agentId: "copilot",
      summary: "Initial summary",
      entityRefs: ["SQLite"],
      topicRefs: [],
      projectRefs: [],
      skillRefs: [],
      toolRefs: [],
      artifactRefs: [],
      outcome: "success",
      corrections: [],
      createdAt: "2026-04-28T01:00:00.000Z",
    });
    await repo.upsert({
      id: "memory-1b",
      runId: "run-1",
      agentId: "copilot",
      summary: "Updated summary",
      entityRefs: ["SQLite"],
      topicRefs: [],
      projectRefs: [],
      skillRefs: [],
      toolRefs: ["search"],
      artifactRefs: [],
      outcome: "success",
      corrections: [],
      createdAt: "2026-04-28T02:00:00.000Z",
    });

    const records = await repo.list();
    assert.equal(records.length, 1);
    assert.equal(records[0]?.runId, "run-1");
    assert.equal(records[0]?.summary, "Updated summary");
    assert.deepEqual(records[0]?.toolRefs, ["search"]);

    const byRunId = await repo.getByRunId("run-1");
    assert.equal(byRunId?.id, "memory-1b");
    assert.equal(await prisma.runMemoryRecord.count(), 1);
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
