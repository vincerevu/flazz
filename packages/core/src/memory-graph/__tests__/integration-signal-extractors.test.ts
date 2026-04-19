import test from "node:test";
import assert from "node:assert/strict";
import { extractGraphSignalsFromNormalized } from "../integration-signal-extractors.js";

test("extractGraphSignalsFromNormalized emits assignment and status signals for github tickets", () => {
  const signals = extractGraphSignalsFromNormalized("github", "ticket", {
    id: "123",
    title: "Fix retrieval regression",
    status: "open",
    assignee: "alice",
    project: "vincerevu/flazz",
    updatedAt: "2026-04-18T10:00:00.000Z",
    preview: "Assigned issue in Flazz.",
    source: "github",
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.source, "github");
  assert.equal(signals[0]?.kind, "assignment");
  assert.deepEqual(signals[0]?.entityRefs, ["alice"]);
  assert.deepEqual(signals[0]?.projectRefs, ["vincerevu/flazz"]);
  assert.equal(signals[0]?.confidence, 0.97);
  assert.match(signals[0]?.provenance ?? "", /normalized:github:123/);
  assert.equal(signals[1]?.kind, "status-change");
});

test("extractGraphSignalsFromNormalized emits assignment and status signals for jira tickets", () => {
  const signals = extractGraphSignalsFromNormalized("jira", "ticket", {
    id: "ENG-42",
    title: "Fix billing export",
    status: "in_progress",
    assignee: "alice",
    project: "ENG",
    updatedAt: "2026-04-18T10:00:00.000Z",
    preview: "Billing export is blocked.",
    source: "jira",
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.source, "jira");
  assert.deepEqual(signals[0]?.projectRefs, ["ENG"]);
  assert.equal(signals[0]?.confidence, 0.94);
  assert.equal(signals[1]?.kind, "status-change");
  assert.equal(signals[1]?.confidence, 0.91);
});

test("extractGraphSignalsFromNormalized emits assignment and status signals for linear tickets", () => {
  const signals = extractGraphSignalsFromNormalized("linear", "ticket", {
    id: "LIN-9",
    title: "Stabilize planner",
    status: "todo",
    assignee: "bob",
    project: "planner",
    updatedAt: "2026-04-18T10:00:00.000Z",
    preview: "Planner cleanup.",
    source: "linear",
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.source, "linear");
  assert.deepEqual(signals[0]?.projectRefs, ["planner"]);
  assert.equal(signals[0]?.confidence, 0.94);
  assert.equal(signals[1]?.confidence, 0.91);
});

test("extractGraphSignalsFromNormalized emits meeting signal for google calendar events", () => {
  const signals = extractGraphSignalsFromNormalized("googlecalendar", "event", {
    id: "evt-1",
    title: "Flazz weekly review",
    startAt: "2026-04-18T11:00:00.000Z",
    endAt: "2026-04-18T12:00:00.000Z",
    attendees: ["alice@example.com", "bob@example.com"],
    organizer: "ops@example.com",
    project: "flazz",
    source: "googlecalendar",
  });

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.source, "googlecalendar");
  assert.equal(signals[0]?.kind, "meeting");
  assert.deepEqual(signals[0]?.entityRefs, ["alice@example.com", "bob@example.com", "ops@example.com"]);
  assert.deepEqual(signals[0]?.projectRefs, ["flazz"]);
  assert.equal(signals[0]?.confidence, 0.9);
  assert.equal(signals[0]?.metadata.attendeeCount, 2);
});

test("extractGraphSignalsFromNormalized selectively emits document signals for notion docs", () => {
  const signals = extractGraphSignalsFromNormalized("notion", "document", {
    id: "doc-1",
    title: "Flazz Decision: Calendar rollout",
    updatedAt: "2026-04-18T12:00:00.000Z",
    owner: "alice",
    url: "https://notion.so/flazz-calendar-rollout",
    preview: "Approved proposal for the Flazz calendar rollout plan.",
    source: "notion",
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.kind, "project-link");
  assert.deepEqual(signals[0]?.projectRefs, ["flazz"]);
  assert.equal(signals[1]?.kind, "decision-candidate");
  assert.equal(signals[1]?.confidence, 0.78);
});

test("extractGraphSignalsFromNormalized skips low-signal docs", () => {
  const signals = extractGraphSignalsFromNormalized("googledocs", "document", {
    id: "doc-2",
    title: "Weekly notes",
    updatedAt: "2026-04-18T12:00:00.000Z",
    preview: "Loose scratch notes.",
    source: "googledocs",
  });

  assert.equal(signals.length, 0);
});

test("extractGraphSignalsFromNormalized selectively emits email signals for important project mail", () => {
  const signals = extractGraphSignalsFromNormalized("gmail", "message", {
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

  assert.equal(signals.length, 3);
  assert.equal(signals[0]?.source, "email");
  assert.deepEqual(signals[0]?.projectRefs, ["flazz"]);
  assert.equal(signals[1]?.kind, "action-item-candidate");
  assert.equal(signals[2]?.kind, "decision-candidate");
});

test("extractGraphSignalsFromNormalized skips low-signal email", () => {
  const signals = extractGraphSignalsFromNormalized("outlook", "message", {
    id: "msg-2",
    threadId: "thread-2",
    title: "Lunch?",
    author: "bob@example.com",
    timestamp: "2026-04-18T13:00:00.000Z",
    snippet: "Want to grab lunch?",
    source: "outlook",
  });

  assert.equal(signals.length, 0);
});

test("extractGraphSignalsFromNormalized skips noisy marketing email even inside the sync window", () => {
  const signals = extractGraphSignalsFromNormalized("gmail", "message", {
    id: "msg-3",
    threadId: "thread-3",
    title: "Get my Recent Courses at the Cheapest Price Possible",
    author: "newsletter@noreply.example.com",
    labels: ["PROMOTIONS"],
    isUnread: true,
    timestamp: "2026-04-18T13:00:00.000Z",
    snippet: "Unsubscribe any time.",
    source: "gmail",
  });

  assert.equal(signals.length, 0);
});

test("extractGraphSignalsFromNormalized emits record signals for linkedin records", () => {
  const signals = extractGraphSignalsFromNormalized("linkedin", "record", {
    id: "rec-1",
    title: "Flazz follow up with investor",
    preview: "Need to review the Flazz deck and schedule a follow up call.",
    owner: "alice",
    recordType: "contact",
    updatedAt: "2026-04-18T14:00:00.000Z",
    source: "linkedin",
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.source, "record");
  assert.equal(signals[0]?.kind, "project-link");
  assert.deepEqual(signals[0]?.projectRefs, ["flazz"]);
  assert.equal(signals[1]?.kind, "action-item-candidate");
});

test("extractGraphSignalsFromNormalized emits file signals for google drive files", () => {
  const signals = extractGraphSignalsFromNormalized("googledrive", "file", {
    id: "file-1",
    title: "Flazz launch assets",
    preview: "Creative pack for the Flazz launch campaign.",
    path: "/Marketing/Flazz/Launch Assets",
    mimeType: "application/pdf",
    source: "googledrive",
  });

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.source, "file");
  assert.equal(signals[0]?.kind, "project-link");
  assert.deepEqual(signals[0]?.projectRefs, ["flazz"]);
});

test("extractGraphSignalsFromNormalized emits spreadsheet signals for google sheets", () => {
  const signals = extractGraphSignalsFromNormalized("googlesheets", "spreadsheet", {
    id: "sheet-1",
    title: "Flazz rollout roadmap",
    preview: "Priority decisions for the Flazz rollout.",
    sheetName: "Roadmap",
    rowLabel: "Approved priority",
    source: "googlesheets",
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.source, "spreadsheet");
  assert.equal(signals[0]?.kind, "project-link");
  assert.deepEqual(signals[0]?.projectRefs, ["flazz"]);
  assert.equal(signals[1]?.kind, "decision-candidate");
});
