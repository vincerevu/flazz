import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPrismaClient } from "../../storage/prisma.js";
import { GraphSyncStateRepo, SqliteGraphSyncStateRepo } from "../graph-sync-state-repo.js";
import { GraphSyncService, mapAppToGraphSyncSource } from "../graph-sync-service.js";

function createStateRepo(tempDir: string) {
  const storage = { workDir: tempDir };
  const prisma = createPrismaClient(storage);
  const repo = new GraphSyncStateRepo({ prisma, storage });
  return { prisma, repo };
}

test("mapAppToGraphSyncSource maps supported apps into sync sources", () => {
  assert.equal(mapAppToGraphSyncSource("github", "ticket"), "github");
  assert.equal(mapAppToGraphSyncSource("jira", "ticket"), "jira");
  assert.equal(mapAppToGraphSyncSource("linear", "ticket"), "linear");
  assert.equal(mapAppToGraphSyncSource("googlecalendar", "event"), "googlecalendar");
  assert.equal(mapAppToGraphSyncSource("gmail", "message"), "email");
  assert.equal(mapAppToGraphSyncSource("notion", "document"), "document");
  assert.equal(mapAppToGraphSyncSource("unknown", "ticket"), null);
});

test("GraphSyncService tracks reads and cadence status for source usage", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-"));
  const { prisma, repo } = createStateRepo(tempDir);

  try {
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T12:00:00.000Z");

    const next = await service.recordRead("github", "ticket", 5, now);
    assert.equal(next?.readsToday, 1);
    assert.equal(next?.itemsSeenToday, 5);

    const immediate = await service.getStatus("github", { now });
    assert.equal(immediate.shouldSync, false);
    assert.equal(immediate.state.readsToday, 1);
    assert.equal(immediate.state.itemsSeenToday, 5);

    const later = await service.getStatus("github", { now: new Date("2026-04-18T12:16:00.000Z") });
    assert.equal(later.shouldSync, true);
    assert.equal(later.dueInMinutes, 0);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService tracks app reads and object detail cooldown", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-detail-"));
  const { prisma, repo } = createStateRepo(tempDir);

  try {
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T13:00:00.000Z");

    await service.recordRead("github", "ticket", 3, now, "list");
    await service.observeItems("github", [{ id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }], now);

    assert.equal(await service.shouldFollowUpDetail("github", { id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }, { now }), true);

    await service.recordDetailFetch("github", "ticket", { id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }, now);

    assert.equal(await service.shouldFollowUpDetail("github", { id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }, { now: new Date("2026-04-18T13:30:00.000Z") }), false);
    assert.equal(await service.shouldFollowUpDetail("github", { id: "issue-1", title: "Fix auth (updated)", updatedAt: "2026-04-18T13:31:00.000Z", status: "open" }, { now: new Date("2026-04-18T13:31:00.000Z") }), true);

    const reviewPath = path.join(tempDir, "memory", "Signals", "Reviews", "sync-budget-status.md");
    const review = readFileSync(reviewPath, "utf8");
    assert.match(review, /## Apps/);
    assert.match(review, /github: listReads=1 \| detailReads=1/);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService marks apps without history for bootstrap only once", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-bootstrap-"));
  const { prisma, repo } = createStateRepo(tempDir);

  try {
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T13:00:00.000Z");

    assert.equal(await service.shouldBootstrapApp("gmail", "message"), true);

    await service.recordRead("gmail", "message", 5, now, "list");
    await service.markBootstrapComplete("gmail", "message", now);

    assert.equal(await service.shouldBootstrapApp("gmail", "message"), false);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService reboots bootstrap when version is missing on older app state", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-bootstrap-version-"));
  const { prisma, repo } = createStateRepo(tempDir);

  try {
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T13:00:00.000Z");

    await service.recordRead("gmail", "message", 5, now, "list");
    assert.equal(await service.shouldBootstrapApp("gmail", "message"), true);

    await service.markBootstrapComplete("gmail", "message", now);
    assert.equal(await service.shouldBootstrapApp("gmail", "message"), false);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService applies and clears app backoff after failures and success", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-backoff-"));
  const { prisma, repo } = createStateRepo(tempDir);

  try {
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T14:00:00.000Z");

    await service.recordAppFailure("gmail", "message", "provider error", now);
    const afterFirst = await service.getAppStatus("gmail", "message", now);
    assert.equal(afterFirst?.inBackoff, true);
    assert.equal(afterFirst?.state.consecutiveFailures, 1);

    await service.recordAppFailure("gmail", "message", "provider error again", new Date("2026-04-18T14:10:00.000Z"));
    const afterSecond = await service.getAppStatus("gmail", "message", new Date("2026-04-18T14:10:00.000Z"));
    assert.equal(afterSecond?.state.consecutiveFailures, 2);
    assert.match(afterSecond?.state.lastError ?? "", /provider error again/);

    await service.recordAppSuccess("gmail", "message", new Date("2026-04-18T14:20:00.000Z"));
    const afterSuccess = await service.getAppStatus("gmail", "message", new Date("2026-04-18T14:20:00.000Z"));
    assert.equal(afterSuccess?.inBackoff, false);
    assert.equal(afterSuccess?.state.consecutiveFailures, 0);
    assert.equal(afterSuccess?.state.lastError, undefined);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService tracks signal counts and writes sync budget review notes", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-review-"));
  const { prisma, repo } = createStateRepo(tempDir);

  try {
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T15:00:00.000Z");

    await service.recordSignalBatch([
      {
        id: "signal-gh-1",
        source: "github",
        kind: "assignment",
        objectId: "gh-1",
        objectType: "ticket",
        title: "Fix graph bug",
        summary: "Assigned issue",
        occurredAt: now.toISOString(),
        entityRefs: [],
        topicRefs: [],
        projectRefs: [],
        relationRefs: [],
        metadata: {},
        provenance: "test",
        fingerprint: "signal-gh-1",
      },
      {
        id: "signal-gh-2",
        source: "github",
        kind: "status-change",
        objectId: "gh-2",
        objectType: "ticket",
        title: "Ship graph budget note",
        summary: "Issue moved to done",
        occurredAt: now.toISOString(),
        entityRefs: [],
        topicRefs: [],
        projectRefs: [],
        relationRefs: [],
        metadata: {},
        provenance: "test",
        fingerprint: "signal-gh-2",
      },
      {
        id: "signal-mail-1",
        source: "email",
        kind: "action-item-candidate",
        objectId: "mail-1",
        objectType: "message",
        title: "Follow up with rollout owners",
        summary: "Need reply before EOD",
        occurredAt: now.toISOString(),
        entityRefs: [],
        topicRefs: [],
        projectRefs: [],
        relationRefs: [],
        metadata: {},
        provenance: "test",
        fingerprint: "signal-mail-1",
      },
    ], now);
    await service.recordClassification("document", 2, now);
    await service.recordDistill("conversation", 1, now);

    const github = await service.getStatus("github", { now });
    const email = await service.getStatus("email", { now });
    const document = await service.getStatus("document", { now });
    const conversation = await service.getStatus("conversation", { now });

    assert.equal(github.state.signalsToday, 2);
    assert.equal(email.state.signalsToday, 1);
    assert.equal(document.state.classificationCallsToday, 2);
    assert.equal(conversation.state.distillCallsToday, 1);

    const reviewPath = path.join(tempDir, "memory", "Signals", "Reviews", "sync-budget-status.md");
    assert.ok(existsSync(reviewPath));
    const review = readFileSync(reviewPath, "utf8");
    assert.match(review, /# Sync Budget Status/);
    assert.match(review, /github: cadence=15m/);
    assert.match(review, /email: cadence=45m/);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("SqliteGraphSyncStateRepo stores source, app, and object state", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-sqlite-graph-sync-"));
  const storage = { workDir: tempDir };
  const prisma = createPrismaClient(storage);

  try {
    const repo = new SqliteGraphSyncStateRepo({ prisma, storage });
    await repo.upsertSourceState({
      source: "github",
      day: "2026-04-18",
      lastReadAt: "2026-04-18T12:00:00.000Z",
      readsToday: 1,
      itemsSeenToday: 3,
      signalsToday: 2,
      classificationCallsToday: 1,
      distillCallsToday: 1,
    });
    await repo.upsertAppState({
      app: "github",
      source: "github",
      day: "2026-04-18",
      lastListReadAt: "2026-04-18T12:00:00.000Z",
      listReadsToday: 1,
      detailReadsToday: 0,
      consecutiveFailures: 0,
      bootstrapVersion: 2,
      bootstrapCompletedAt: "2026-04-18T12:05:00.000Z",
    });
    await repo.upsertObjectState({
      app: "github",
      objectId: "issue-1",
      lastSeenAt: "2026-04-18T12:00:00.000Z",
      lastFingerprint: "issue-1|Fix sync",
    });

    const source = await repo.getSourceState("github", "2026-04-18");
    const app = await repo.getLatestAppState("github", "github");
    const object = await repo.getObjectState("github", "issue-1");

    assert.equal(source.itemsSeenToday, 3);
    assert.equal(app?.bootstrapVersion, 2);
    assert.equal(object?.lastFingerprint, "issue-1|Fix sync");
    assert.equal(await repo.hasSourceHistory("github"), true);
    assert.equal(await repo.hasAppHistory("github", "github"), true);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
