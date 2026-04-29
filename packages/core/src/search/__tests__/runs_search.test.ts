import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMessageEvent } from "../../agents/runtime/runtime-events.js";
import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";
import { SqliteRunsRepo } from "../../runs/sqlite-repo.js";
import { RunsSearchProvider } from "../runs_search.js";

class TestIdGenerator {
  private seq = 0;

  async next(): Promise<string> {
    this.seq += 1;
    return `run-search-${String(this.seq).padStart(3, "0")}`;
  }
}

test("RunsSearchProvider searches SQLite run messages when sqlite mode is enabled", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-search-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));
  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteRunsRepo({
    idGenerator: new TestIdGenerator(),
    prisma,
    storage: { databaseUrl },
  });
  const provider = new RunsSearchProvider({
    prisma,
    storage: { databaseUrl },
  });

  try {
    const run = await repo.create({ agentId: "copilot", runType: "chat" });
    await repo.appendEvents(run.id, [
      createMessageEvent({
        runId: run.id,
        messageId: "search-message-1",
        message: {
          role: "user",
          content: "Find the nebula migration note",
        },
      }),
    ]);

    const results = await provider.search("nebula", 10);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.type, "chat");
    assert.equal(results[0]?.path, run.id);
    assert.match(results[0]?.preview ?? "", /nebula/i);
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
