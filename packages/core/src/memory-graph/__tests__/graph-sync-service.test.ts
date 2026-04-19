import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { GraphSyncStateRepo } from "../graph-sync-state-repo.js";
import { GraphSyncService, mapAppToGraphSyncSource } from "../graph-sync-service.js";

test("mapAppToGraphSyncSource maps supported apps into sync sources", () => {
  assert.equal(mapAppToGraphSyncSource("github", "ticket"), "github");
  assert.equal(mapAppToGraphSyncSource("jira", "ticket"), "jira");
  assert.equal(mapAppToGraphSyncSource("linear", "ticket"), "linear");
  assert.equal(mapAppToGraphSyncSource("googlecalendar", "event"), "googlecalendar");
  assert.equal(mapAppToGraphSyncSource("gmail", "message"), "email");
  assert.equal(mapAppToGraphSyncSource("notion", "document"), "document");
  assert.equal(mapAppToGraphSyncSource("unknown", "ticket"), null);
});

test("GraphSyncService tracks reads and cadence status for source usage", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-"));

  try {
    const repo = new GraphSyncStateRepo(tempDir);
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T12:00:00.000Z");

    const next = service.recordRead("github", "ticket", 5, now);
    assert.equal(next?.readsToday, 1);
    assert.equal(next?.itemsSeenToday, 5);

    const immediate = service.getStatus("github", { now });
    assert.equal(immediate.shouldSync, false);
    assert.equal(immediate.state.readsToday, 1);
    assert.equal(immediate.state.itemsSeenToday, 5);

    const later = service.getStatus("github", { now: new Date("2026-04-18T12:16:00.000Z") });
    assert.equal(later.shouldSync, true);
    assert.equal(later.dueInMinutes, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService tracks app reads and object detail cooldown", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-detail-"));

  try {
    const repo = new GraphSyncStateRepo(tempDir);
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T13:00:00.000Z");

    service.recordRead("github", "ticket", 3, now, "list");
    service.observeItems("github", [{ id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }], now);

    assert.equal(service.shouldFollowUpDetail("github", { id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }, { now }), true);

    service.recordDetailFetch("github", "ticket", { id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }, now);

    assert.equal(service.shouldFollowUpDetail("github", { id: "issue-1", title: "Fix auth", updatedAt: "2026-04-18T12:59:00.000Z", status: "open" }, { now: new Date("2026-04-18T13:30:00.000Z") }), false);
    assert.equal(service.shouldFollowUpDetail("github", { id: "issue-1", title: "Fix auth (updated)", updatedAt: "2026-04-18T13:31:00.000Z", status: "open" }, { now: new Date("2026-04-18T13:31:00.000Z") }), true);

    const reviewPath = path.join(tempDir, "memory", "Signals", "Reviews", "sync-budget-status.md");
    const review = readFileSync(reviewPath, "utf8");
    assert.match(review, /## Apps/);
    assert.match(review, /github: listReads=1 \| detailReads=1/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService marks apps without history for bootstrap only once", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-bootstrap-"));

  try {
    const repo = new GraphSyncStateRepo(tempDir);
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T13:00:00.000Z");

    assert.equal(service.shouldBootstrapApp("gmail", "message"), true);

    service.recordRead("gmail", "message", 5, now, "list");
    service.markBootstrapComplete("gmail", "message", now);

    assert.equal(service.shouldBootstrapApp("gmail", "message"), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService reboots bootstrap when version is missing on older app state", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-bootstrap-version-"));

  try {
    const repo = new GraphSyncStateRepo(tempDir);
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T13:00:00.000Z");

    service.recordRead("gmail", "message", 5, now, "list");
    assert.equal(service.shouldBootstrapApp("gmail", "message"), true);

    service.markBootstrapComplete("gmail", "message", now);
    assert.equal(service.shouldBootstrapApp("gmail", "message"), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService applies and clears app backoff after failures and success", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-backoff-"));

  try {
    const repo = new GraphSyncStateRepo(tempDir);
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T14:00:00.000Z");

    service.recordAppFailure("gmail", "message", "provider error", now);
    const afterFirst = service.getAppStatus("gmail", "message", now);
    assert.equal(afterFirst?.inBackoff, true);
    assert.equal(afterFirst?.state.consecutiveFailures, 1);

    service.recordAppFailure("gmail", "message", "provider error again", new Date("2026-04-18T14:10:00.000Z"));
    const afterSecond = service.getAppStatus("gmail", "message", new Date("2026-04-18T14:10:00.000Z"));
    assert.equal(afterSecond?.state.consecutiveFailures, 2);
    assert.match(afterSecond?.state.lastError ?? "", /provider error again/);

    service.recordAppSuccess("gmail", "message", new Date("2026-04-18T14:20:00.000Z"));
    const afterSuccess = service.getAppStatus("gmail", "message", new Date("2026-04-18T14:20:00.000Z"));
    assert.equal(afterSuccess?.inBackoff, false);
    assert.equal(afterSuccess?.state.consecutiveFailures, 0);
    assert.equal(afterSuccess?.state.lastError, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GraphSyncService tracks signal counts and writes sync budget review notes", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-graph-sync-review-"));

  try {
    const repo = new GraphSyncStateRepo(tempDir);
    const service = new GraphSyncService(repo, tempDir);
    const now = new Date("2026-04-18T15:00:00.000Z");

    service.recordSignalBatch([
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
    service.recordClassification("document", 2, now);
    service.recordDistill("conversation", 1, now);

    const github = service.getStatus("github", { now });
    const email = service.getStatus("email", { now });
    const document = service.getStatus("document", { now });
    const conversation = service.getStatus("conversation", { now });

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
    rmSync(tempDir, { recursive: true, force: true });
  }
});
