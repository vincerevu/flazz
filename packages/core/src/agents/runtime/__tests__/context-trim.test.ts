import test from "node:test";
import assert from "node:assert/strict";
import { trimMessagesForPrompt } from "../context-trim.js";

test("trimMessagesForPrompt drops low-value filler turns outside the recent window", () => {
  const result = trimMessagesForPrompt([
    { role: "user", content: "ok" },
    { role: "assistant", content: [{ type: "text", text: "sure" }] },
    { role: "user", content: "Please keep this decision" },
    { role: "assistant", content: [{ type: "text", text: "Working on it." }] },
  ] as never, 2);

  assert.equal(result.droppedMessages, 2);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0]?.role, "user");
});

test("trimMessagesForPrompt truncates older verbose tool output but preserves recent messages", () => {
  const longToolOutput = "x".repeat(800);
  const result = trimMessagesForPrompt([
    { role: "tool", toolCallId: "call-1", toolName: "search", content: longToolOutput },
    { role: "assistant", content: [{ type: "text", text: "recent answer" }] },
    { role: "user", content: "recent user" },
  ] as never, 2);

  assert.equal(result.droppedMessages, 0);
  assert.equal(result.downgradedMessages, 1);
  const first = result.messages[0];
  assert.equal(first?.role, "tool");
  if (first?.role === "tool") {
    assert.ok(first.content.length < longToolOutput.length);
    assert.match(first.content, /\[trimmed\]/);
  }
});

test("trimMessagesForPrompt downgrades structured list-like tool output into compact top-k payload", () => {
  const result = trimMessagesForPrompt([
    {
      role: "tool",
      toolCallId: "call-1",
      toolName: "search",
      content: JSON.stringify({
        results: [
          { id: "1", title: "A", url: "https://a.test", score: 0.9, body: "long" },
          { id: "2", title: "B", url: "https://b.test", score: 0.8, body: "long" },
          { id: "3", title: "C", url: "https://c.test", score: 0.7, body: "long" },
          { id: "4", title: "D", url: "https://d.test", score: 0.6, body: "long" },
        ],
      }),
    },
    { role: "assistant", content: [{ type: "text", text: "recent answer" }] },
    { role: "user", content: "recent user" },
  ] as never, 2);

  const first = result.messages[0];
  assert.equal(first?.role, "tool");
  if (first?.role === "tool") {
    const parsed = JSON.parse(first.content) as { totalItems: number; keptItems: number; items: unknown[]; outputClass: string };
    assert.equal(parsed.totalItems, 4);
    assert.equal(parsed.keptItems, 3);
    assert.equal(parsed.outputClass, "discovery");
  }
});

test("trimMessagesForPrompt classifies execution-like tool output separately", () => {
  const result = trimMessagesForPrompt([
    {
      role: "tool",
      toolCallId: "call-2",
      toolName: "update-ticket",
      content: JSON.stringify({
        success: true,
        status: "updated",
        id: "T-123",
        body: "very long content that should not survive in full",
      }),
    },
    { role: "assistant", content: [{ type: "text", text: "recent answer" }] },
    { role: "user", content: "recent user" },
  ] as never, 2);

  const first = result.messages[0];
  assert.equal(first?.role, "tool");
  if (first?.role === "tool") {
    const parsed = JSON.parse(first.content) as { kind: string; outputClass: string; details: { id?: string } };
    assert.equal(parsed.outputClass, "execution");
    assert.equal(parsed.kind, "trimmed-execution");
    assert.equal(parsed.details.id, "T-123");
  }
});

test("trimMessagesForPrompt applies shell-output specialization for shell-command results", () => {
  const result = trimMessagesForPrompt([
    {
      role: "tool",
      toolCallId: "call-3",
      toolName: "shell-command",
      content: Array.from({ length: 20 }, (_, index) => `line-${index + 1}`).join("\n"),
    },
    { role: "assistant", content: [{ type: "text", text: "recent answer" }] },
    { role: "user", content: "recent user" },
  ] as never, 2);

  const first = result.messages[0];
  assert.equal(first?.role, "tool");
  if (first?.role === "tool") {
    const parsed = JSON.parse(first.content) as { outputClass: string; totalLines: number; keptLines: number; tail: string[] };
    assert.equal(parsed.outputClass, "shell-output");
    assert.equal(parsed.totalLines, 20);
    assert.equal(parsed.keptLines, 12);
    assert.equal(parsed.tail[0], "line-9");
  }
});

test("trimMessagesForPrompt applies filesystem-read specialization for workspace-readFile", () => {
  const content = Array.from({ length: 30 }, (_, index) => `row-${index + 1}`).join("\n");
  const result = trimMessagesForPrompt([
    {
      role: "tool",
      toolCallId: "call-4",
      toolName: "workspace-readFile",
      content,
    },
    { role: "assistant", content: [{ type: "text", text: "recent answer" }] },
    { role: "user", content: "recent user" },
  ] as never, 2);

  const first = result.messages[0];
  assert.equal(first?.role, "tool");
  if (first?.role === "tool") {
    const parsed = JSON.parse(first.content) as { outputClass: string; totalLines: number; head: string[]; tail: string[] };
    assert.equal(parsed.outputClass, "filesystem-read");
    assert.equal(parsed.totalLines, 30);
    assert.equal(parsed.head[0], "row-1");
    assert.equal(parsed.tail[0], "row-23");
  }
});
