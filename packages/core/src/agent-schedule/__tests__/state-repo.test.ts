import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";
import { SqliteAgentScheduleStateRepo } from "../state-repo.js";

test("SqliteAgentScheduleStateRepo stores schedule runtime state per agent", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-agent-schedule-state-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));
  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteAgentScheduleStateRepo({
    prisma,
    storage: { databaseUrl },
  });

  try {
    await repo.ensureState();
    assert.deepEqual(await repo.getState(), { agents: {} });

    await repo.updateAgentState("daily-check", {
      status: "running",
      startedAt: "2026-04-28T01:00:00.000Z",
      runCount: 1,
    });

    const running = await repo.getAgentState("daily-check");
    assert.equal(running?.status, "running");
    assert.equal(running?.runCount, 1);
    assert.equal(running?.startedAt, "2026-04-28T01:00:00.000Z");

    await repo.setAgentState("weekly-review", {
      status: "scheduled",
      startedAt: null,
      lastRunAt: null,
      nextRunAt: "2026-05-01T01:00:00.000Z",
      lastError: null,
      runCount: 0,
    });

    const state = await repo.getState();
    assert.equal(Object.keys(state.agents).length, 2);
    assert.equal(state.agents["weekly-review"]?.nextRunAt, "2026-05-01T01:00:00.000Z");

    await repo.deleteAgentState("daily-check");
    assert.equal(await repo.getAgentState("daily-check"), null);
    assert.equal(await prisma.agentScheduleState.count(), 1);
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
