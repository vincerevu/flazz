import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { GraphSignalRepo } from "../graph-signal-repo.js";
import { GraphSignalPromoter } from "../graph-signal-promoter.js";
import { GraphSignalService } from "../graph-signal-service.js";

test("GraphSignalService stores and promotes github signals deterministically", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-"));

  try {
    const repo = new GraphSignalRepo(tempDir);
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    const result = service.ingestNormalizedItem("github", "ticket", {
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
    assert.equal(repo.list().length, 2);
    assert.ok(result.written.every((entry) => entry.path && existsSync(entry.path)));
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}People${path.sep}`))));
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}Projects${path.sep}`))));
    assert.ok(result.written.some((entry) => entry.aggregatePaths.some((aggregatePath) => aggregatePath.includes(`${path.sep}Work${path.sep}`))));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSignalService writes review/debug aggregates for document signals", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-doc-"));

  try {
    const repo = new GraphSignalRepo(tempDir);
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    const result = service.ingestNormalizedItem("notion", "document", {
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
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSignalService promotes user-facing knowledge notes from repeated signals", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-knowledge-"));

  try {
    const repo = new GraphSignalRepo(tempDir);
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    service.ingestNormalizedItem("github", "ticket", {
      id: "123",
      title: "Fix retrieval regression",
      status: "open",
      assignee: "alice",
      project: "flazz",
      updatedAt: "2026-04-18T10:00:00.000Z",
      preview: "Assigned issue in Flazz.",
      source: "github",
    });

    const secondResult = service.ingestNormalizedItem("github", "ticket", {
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
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSignalService writes review aggregates for email and conversation signals", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-signal-review-"));

  try {
    const repo = new GraphSignalRepo(tempDir);
    const promoter = new GraphSignalPromoter(tempDir);
    const service = new GraphSignalService(repo, promoter);

    const emailResult = service.ingestNormalizedItem("gmail", "message", {
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

    const conversationResult = service.ingestRunMemoryRecord({
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
    rmSync(tempDir, { recursive: true, force: true });
  }
});
