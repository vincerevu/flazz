import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";
import { SqliteGraphSignalRepo } from "../graph-signal-repo.js";
import { GraphSignalPromoter } from "../graph-signal-promoter.js";
import { GraphSignalService } from "../graph-signal-service.js";

function createRepo(tempDir: string) {
  const databaseUrl = toPrismaSqliteUrl(path.join(tempDir, "flazz.db"));
  const prisma = createPrismaClient({ databaseUrl });
  const repo = new SqliteGraphSignalRepo({
    prisma,
    storage: { databaseUrl },
  });
  return { prisma, repo };
}

test("GraphSignalService stores and promotes github signals deterministically", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-"));
  const { prisma, repo } = createRepo(tempDir);

  try {
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    const result = await service.ingestNormalizedItem("github", "ticket", {
      id: "123",
      title: "Fix retrieval regression",
      status: "open",
      assignee: "alice",
      project: "vincerevu/flazz",
      updatedAt: "2026-04-18T10:00:00.000Z",
      preview: "Assigned issue in Flazz.",
      source: "github",
    });

    assert.equal(result.count, 2);
    assert.equal((await repo.list()).length, 2);
    assert.ok(result.written.every((entry) => entry.path && existsSync(entry.path)));
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}People${path.sep}`))));
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}Projects${path.sep}`))));
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}Work${path.sep}`))));
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSignalService writes review/debug aggregates for document signals", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-doc-"));
  const { prisma, repo } = createRepo(tempDir);

  try {
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    const result = await service.ingestNormalizedItem("notion", "document", {
      id: "doc-1",
      title: "Flazz Decision: Calendar rollout",
      updatedAt: "2026-04-18T12:00:00.000Z",
      owner: "alice",
      url: "https://notion.so/flazz-calendar-rollout",
      preview: "Approved proposal for the Flazz calendar rollout plan.",
      source: "notion",
    });

    assert.equal(result.count, 2);
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`Reviews${path.sep}document-promotion-candidates.md`))));
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`Reviews${path.sep}signal-debug-summary.md`))));
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSignalService promotes user-facing knowledge notes from repeated signals", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-knowledge-"));
  const { prisma, repo } = createRepo(tempDir);

  try {
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    await service.ingestNormalizedItem("github", "ticket", {
      id: "123",
      title: "Fix retrieval regression",
      status: "open",
      assignee: "alice",
      project: "flazz",
      updatedAt: "2026-04-18T10:00:00.000Z",
      preview: "Assigned issue in Flazz.",
      source: "github",
    });

    const secondResult = await service.ingestNormalizedItem("github", "ticket", {
      id: "123",
      title: "Fix retrieval regression",
      status: "blocked",
      assignee: "alice",
      project: "flazz",
      updatedAt: "2026-04-18T10:05:00.000Z",
      preview: "Blocked issue in Flazz.",
      source: "github",
    });

    assert.ok(secondResult.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}Knowledge${path.sep}Projects${path.sep}flazz.md`))));
    assert.ok(secondResult.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}Knowledge${path.sep}People${path.sep}alice.md`))));
    assert.ok(secondResult.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}Knowledge${path.sep}Work${path.sep}`))));
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSignalService writes review aggregates for email and conversation signals", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-review-"));
  const { prisma, repo } = createRepo(tempDir);

  try {
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    const emailResult = await service.ingestNormalizedItem("gmail", "message", {
      id: "msg-1",
      threadId: "thread-1",
      title: "Action required for Flazz rollout",
      author: "alice@example.com",
      recipients: ["team@example.com"],
      labels: ["IMPORTANT"],
      importance: true,
      isUnread: true,
      timestamp: "2026-04-18T13:00:00.000Z",
      snippet: "Please review the rollout plan and reply today.",
      source: "gmail",
    });

    const conversationResult = await service.ingestRunMemoryRecord({
      id: "runmem-1",
      runId: "run-1",
      agentId: "copilot",
      taskType: "integration-listItemsCompact",
      summary: "Daily check run.",
      firstUserMessage: "For next time, prefer GitHub and Google Calendar for daily checks.",
      entityRefs: ["GitHub", "Google", "Calendar"],
      topicRefs: [],
      projectRefs: [],
      skillRefs: ["daily-check"],
      toolRefs: ["integration-listItemsCompact", "integration-getItemSummary"],
      artifactRefs: [],
      outcome: "success",
      failureCategory: undefined,
      corrections: ["Không phải Outlook nữa, use Google Calendar instead."],
      createdAt: "2026-04-18T14:00:00.000Z",
    });

    assert.ok(emailResult.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`Reviews${path.sep}email-promotion-candidates.md`))));
    assert.ok(conversationResult.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`Reviews${path.sep}conversation-memory-candidates.md`))));
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
