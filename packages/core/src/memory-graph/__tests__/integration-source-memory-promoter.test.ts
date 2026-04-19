import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { IntegrationSourceMemoryPromoter } from "../integration-source-memory-promoter.js";

test("IntegrationSourceMemoryPromoter writes canonical source snapshots under memory/Sources", () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "flazz-source-promoter-"));
  const promoter = new IntegrationSourceMemoryPromoter(workDir);

  const first = promoter.promote("gmail", "message", {
    title: "Re: Flazz weekly review",
    summary: "Please review the rollout and reply today.",
    normalized: {
      id: "msg-1",
      threadId: "thread-1",
      author: "alice@example.com",
      timestamp: "2026-04-19T08:00:00.000Z",
      labels: ["IMPORTANT"],
    },
  });

  assert.ok(first);
  assert.match(first.path.replace(/\\/g, "/"), /gmail_sync\/thread-1\.md$/);
  assert.equal(first.created, true);

  const second = promoter.promote("gmail", "message", {
    title: "Flazz weekly review",
    summary: "Updated summary",
    normalized: {
      id: "msg-2",
      threadId: "thread-1",
      author: "alice@example.com",
      timestamp: "2026-04-19T09:00:00.000Z",
    },
  });

  assert.ok(second);
  assert.equal(second.path, first.path);
  assert.equal(second.created, false);

  const content = fs.readFileSync(first.path, "utf8");
  assert.match(content, /type: integration-source/);
  assert.match(content, /objectKey: gmail:message:thread-1/);
  assert.match(content, /# Flazz weekly review/);
  assert.match(content, /Updated summary/);
  assert.match(content, /filter: \[\]/);
});
