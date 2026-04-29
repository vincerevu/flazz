import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";
import { SqliteGraphSignalRepo } from "../graph-signal-repo.js";

function makeSignal(overrides: Partial<Parameters<SqliteGraphSignalRepo["upsert"]>[0]> = {}) {
  return {
    id: "signal-1",
    source: "github" as const,
    kind: "assignment" as const,
    objectId: "issue-1",
    objectType: "ticket",
    title: "Fix SQLite graph signals",
    summary: "Assigned to Alice",
    occurredAt: "2026-04-28T01:00:00.000Z",
    confidence: 0.9,
    entityRefs: ["alice"],
    topicRefs: ["sqlite"],
    projectRefs: ["flazz"],
    relationRefs: [],
    metadata: {},
    provenance: "github:issue-1",
    fingerprint: "github:issue-1:assignment",
    ...overrides,
  };
}

test("SqliteGraphSignalRepo upserts and lists graph signals", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-graph-signals-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));
  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteGraphSignalRepo({
    prisma,
    storage: { databaseUrl },
  });

  try {
    assert.equal((await repo.upsert(makeSignal())).created, true);
    assert.equal((await repo.upsert(makeSignal({ title: "Updated title" }))).created, false);

    const signals = await repo.list();
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.title, "Updated title");

    const byFingerprint = await repo.getByFingerprint("github:issue-1:assignment");
    assert.equal(byFingerprint?.id, "signal-1");
    assert.equal(await prisma.graphSignal.count(), 1);
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
