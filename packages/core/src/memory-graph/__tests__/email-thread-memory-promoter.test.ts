import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IntegrationItemMemoryPromoter } from "../integration-item-memory-promoter.js";

function makeTempWorkDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "flazz-email-thread-"));
}

test("IntegrationItemMemoryPromoter promotes project-linked items into canonical project notes", () => {
  const workDir = makeTempWorkDir();
  const promoter = new IntegrationItemMemoryPromoter(workDir);

  const first = promoter.promote("gmail", "message", {
    title: "Re: Improve skill learning recurrence and review signals",
    summary: "Action required for Flazz rollout and follow-up review.",
    normalized: {
      id: "msg-1",
      threadId: "thread-1",
      title: "Re: Improve skill learning recurrence and review signals",
      author: "alice@example.com",
      timestamp: "2026-04-18T12:00:00.000Z",
      snippet: "Please review and reply today.",
      isUnread: true,
      source: "gmail",
    },
  });

  assert.ok(first);
  assert.match(first.path, /Projects[\\/]flazz\.md$/);
  assert.equal(fs.existsSync(first.path), true);

  const second = promoter.promote("gmail", "message", {
    title: "Re: Improve skill learning recurrence and review signals",
    summary: "Updated summary",
    normalized: {
      id: "msg-2",
      threadId: "thread-1",
      title: "Re: Improve skill learning recurrence and review signals",
      author: "alice@example.com",
      timestamp: "2026-04-18T13:00:00.000Z",
      snippet: "Latest thread update.",
      source: "gmail",
    },
  });

  assert.ok(second);
  assert.equal(second.path, first.path);
  const content = fs.readFileSync(first.path, "utf8");
  assert.match(content, /# flazz/i);
  assert.match(content, /<!-- integration:gmail:message:thread-1:start -->/);
});

test("IntegrationItemMemoryPromoter skips unresolved items instead of creating title-based work notes", () => {
  const workDir = makeTempWorkDir();
  const promoter = new IntegrationItemMemoryPromoter(workDir);

  const first = promoter.promote("gmail", "message", {
    title: "Weekly review",
    summary: "First thread",
    normalized: {
      id: "msg-1",
      threadId: "thread-1",
      source: "gmail",
    },
  });
  assert.equal(first, null);
  assert.equal(fs.existsSync(path.join(workDir, "memory", "Work")), false);
});

test("IntegrationItemMemoryPromoter writes canonical project notes for non-email providers too", () => {
  const workDir = makeTempWorkDir();
  const promoter = new IntegrationItemMemoryPromoter(workDir);

  const created = promoter.promote("github", "ticket", {
    title: "Fix graph sync cadence bug",
    summary: "Assigned issue for Flazz with action required.",
    normalized: {
      id: "issue-123",
      assignee: "alice",
      status: "open",
      updatedAt: "2026-04-18T12:00:00.000Z",
      project: "flazz",
      source: "github",
    },
  });

  assert.ok(created);
  const content = fs.readFileSync(created.path, "utf8");
  assert.match(created.path, /Projects[\\/]flazz\.md$/);
  assert.match(content, /<!-- integration:github:ticket:issue-123:start -->/);
  assert.match(content, /\*\*Status:\*\* open/);
});

test("IntegrationItemMemoryPromoter uses canonical people notes when no project is resolved", () => {
  const workDir = makeTempWorkDir();
  const promoter = new IntegrationItemMemoryPromoter(workDir);

  const created = promoter.promote("gmail", "message", {
    title: "Quick intro",
    summary: "Let's talk this week about a possible collaboration.",
    normalized: {
      id: "msg-3",
      threadId: "thread-3",
      author: "sarah.chen@acme.com",
      source: "gmail",
    },
  });

  assert.ok(created);
  assert.match(created.path, /People[\\/]Sarah Chen\.md$/);
});
