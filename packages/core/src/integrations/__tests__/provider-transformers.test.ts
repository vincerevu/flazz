import test from "node:test";
import assert from "node:assert/strict";
import { buildSlicesView, buildStructuredView, buildSummaryView, normalizeResource } from "../provider-transformers.js";

test("normalizeResource maps gmail message fields into normalized shape", () => {
  const result = normalizeResource("gmail", "message", {
    id: "msg-1",
    threadId: "thread-1",
    subject: "Quarterly update",
    from: "ceo@example.com",
    snippet: "Revenue grew 20 percent",
  }) as { id: string; threadId?: string; title: string } | null;

  assert.ok(result);
  assert.equal(result?.id, "msg-1");
  assert.equal(result?.threadId, "thread-1");
  assert.equal(result?.title, "Quarterly update");
});

test("buildSummaryView creates concise preview", () => {
  const result = buildSummaryView("notion", "document", {
    id: "doc-1",
    title: "Strategy",
    content: "This is a long strategy document with detailed planning and prioritization notes.",
  });

  assert.equal(result.title, "Strategy");
  assert.match(result.summary, /strategy document/i);
});

test("buildSlicesView chunks long bodies", () => {
  const result = buildSlicesView("slack", "message", {
    ts: "123",
    text: "a".repeat(1300),
  });

  assert.equal(result.slices.length, 3);
});

test("buildStructuredView preserves provider specific details", () => {
  const result = buildStructuredView("jira", "ticket", {
    id: "ISSUE-1",
    title: "Bug in sync",
    description: "Users see stale sync status after reconnect.",
    labels: ["bug", "sync"],
  }) as { labels?: string[]; normalized?: { title?: string } };

  assert.equal(result.normalized?.title, "Bug in sync");
  assert.deepEqual(result.labels, ["bug", "sync"]);
});

test("normalizeResource maps github notification-like fields into ticket shape", () => {
  const result = normalizeResource("github", "ticket", {
    id: "notif-1",
    subject: "Review requested",
    repository: "flazzlabs/flazz",
    reason: "review_requested",
    state: "open",
  }) as { id: string; title: string; status?: string; preview?: string } | null;

  assert.ok(result);
  assert.equal(result?.id, "notif-1");
  assert.equal(result?.title, "Review requested");
  assert.equal(result?.status, "open");
  assert.match(result?.preview ?? "", /flazzlabs\/flazz/i);
});

test("normalizeResource maps CRM-style records into record shape", () => {
  const result = normalizeResource("hubspot", "record", {
    id: "rec-1",
    name: "Acme Corp",
    objectType: "company",
    ownerName: "Jane",
    summary: "Important customer account",
  }) as { id: string; title: string; recordType?: string; owner?: string } | null;

  assert.ok(result);
  assert.equal(result?.id, "rec-1");
  assert.equal(result?.title, "Acme Corp");
  assert.equal(result?.recordType, "company");
  assert.equal(result?.owner, "Jane");
});

test("normalizeResource maps repository file data into code shape", () => {
  const result = normalizeResource("gitlab", "code", {
    path: "src/index.ts",
    repoName: "flazz",
    snippet: "export const main = true",
  }) as { title: string; path?: string; repository?: string } | null;

  assert.ok(result);
  assert.equal(result?.title, "src/index.ts");
  assert.equal(result?.path, "src/index.ts");
  assert.equal(result?.repository, "flazz");
});

test("normalizeResource maps row-like spreadsheet data into spreadsheet shape", () => {
  const result = normalizeResource("googlesheets", "spreadsheet", {
    rowId: "row-7",
    primaryField: "Q2 revenue",
    sheetName: "Metrics",
    values: "Revenue, growth, margin",
  }) as { id: string; title: string; sheetName?: string; rowLabel?: string } | null;

  assert.ok(result);
  assert.equal(result?.id, "row-7");
  assert.equal(result?.title, "Q2 revenue");
  assert.equal(result?.sheetName, "Metrics");
  assert.equal(result?.rowLabel, "Q2 revenue");
});
