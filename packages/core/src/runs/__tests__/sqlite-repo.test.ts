import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMessageEvent } from "../../agents/runtime/runtime-events.js";
import { SqliteRunsRepo } from "../sqlite-repo.js";
import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";

class TestIdGenerator {
  private seq = 0;

  async next(): Promise<string> {
    this.seq += 1;
    return `run-${String(this.seq).padStart(3, "0")}`;
  }
}

test("SqliteRunsRepo persists events and returns the existing Run contract", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-runs-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));

  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteRunsRepo({
    idGenerator: new TestIdGenerator(),
    prisma,
    storage: { databaseUrl },
  });

  try {
    const run = await repo.create({ agentId: "copilot", runType: "chat" });
    const message = createMessageEvent({
      runId: run.id,
      messageId: "message-1",
      message: {
        role: "user",
        content: "Summarize the SQLite plan",
      },
    });

    await repo.appendEvents(run.id, [message]);

    const fetched = await repo.fetch(run.id);
    assert.equal(fetched.id, run.id);
    assert.equal(fetched.title, "Summarize the SQLite plan");
    assert.equal(fetched.log.length, 2);
    assert.equal(fetched.log[1]?.type, "message");

    const conversation = await repo.fetchConversation(run.id);
    assert.equal(conversation.id, run.id);
    assert.equal(conversation.messages.length, 1);
    assert.equal(conversation.messages[0]?.id, "message-1");
    assert.equal(conversation.messages[0]?.message.role, "user");
    assert.equal(conversation.auxiliaryEvents.length, 1);
    assert.equal(conversation.auxiliaryEvents[0]?.type, "start");

    const list = await repo.list(undefined, { runType: "chat" });
    assert.equal(list.runs.length, 1);
    assert.equal(list.runs[0]?.id, run.id);

    const parts = await prisma.messagePart.findMany({
      where: { runId: run.id },
      orderBy: { position: "asc" },
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.text, "Summarize the SQLite plan");
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteRunsRepo hydrates missing event timestamps from SQLite rows", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-runs-ts-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));

  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteRunsRepo({
    idGenerator: new TestIdGenerator(),
    prisma,
    storage: { databaseUrl },
  });

  try {
    const run = await repo.create({ agentId: "copilot", runType: "chat" });
    await repo.appendEvents(run.id, [
      {
        runId: run.id,
        type: "tool-invocation",
        toolCallId: "tool-1",
        toolName: "executeCommand",
        input: JSON.stringify({ command: "echo ok" }),
        subflow: [],
      },
      {
        runId: run.id,
        type: "tool-result",
        toolCallId: "tool-1",
        toolName: "executeCommand",
        result: { success: true },
        subflow: [],
      },
    ]);

    const conversation = await repo.fetchConversation(run.id);
    const toolEvents = conversation.auxiliaryEvents.filter(
      (event) => event.type === "tool-invocation" || event.type === "tool-result",
    );

    assert.equal(toolEvents.length, 2);
    assert.ok(toolEvents.every((event) => event.ts && Number.isFinite(new Date(event.ts).getTime())));
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteRunsRepo projects run lifecycle status events", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-runs-status-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));

  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteRunsRepo({
    idGenerator: new TestIdGenerator(),
    prisma,
    storage: { databaseUrl },
  });

  try {
    const run = await repo.create({ agentId: "copilot", runType: "chat" });
    await repo.appendEvents(run.id, [
      {
        runId: run.id,
        type: "run-processing-start",
        subflow: [],
        ts: "2026-04-28T01:00:00.000Z",
      },
    ]);

    const running = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(running.status, "processing");
    assert.equal(running.completedAt, null);

    await repo.appendEvents(run.id, [
      {
        runId: run.id,
        type: "run-processing-end",
        subflow: [],
        ts: "2026-04-28T01:02:00.000Z",
      },
    ]);

    const completed = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(completed.status, "completed");
    assert.equal(completed.completedAt?.toISOString(), "2026-04-28T01:02:00.000Z");
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteRunsRepo does not let processing end overwrite stopped status", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flazz-sqlite-runs-stopped-"));
  const databaseUrl = toPrismaSqliteUrl(path.join(tmpDir, "flazz.db"));

  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteRunsRepo({
    idGenerator: new TestIdGenerator(),
    prisma,
    storage: { databaseUrl },
  });

  try {
    const run = await repo.create({ agentId: "copilot", runType: "chat" });
    await repo.appendEvents(run.id, [
      {
        runId: run.id,
        type: "run-processing-start",
        subflow: [],
        ts: "2026-04-28T01:00:00.000Z",
      },
      {
        runId: run.id,
        type: "run-stopped",
        reason: "user-requested",
        subflow: [],
        ts: "2026-04-28T01:01:00.000Z",
      },
      {
        runId: run.id,
        type: "run-processing-end",
        subflow: [],
        ts: "2026-04-28T01:02:00.000Z",
      },
    ]);

    const stopped = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.completedAt?.toISOString(), "2026-04-28T01:01:00.000Z");
  } finally {
    await prisma.$disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
