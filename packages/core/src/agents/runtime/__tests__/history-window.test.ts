import assert from "node:assert/strict";
import test from "node:test";
import { buildSafeRecentMessages, findHistoryWindowStart } from "../history-window.js";

test("buildSafeRecentMessages preserves assistant tool call when suffix includes its tool result", () => {
  const messages = [
    { role: "user", content: "u1" },
    {
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: "call-1", toolName: "search", arguments: {} },
      ],
    },
    { role: "tool", toolCallId: "call-1", toolName: "search", content: "{}" },
    { role: "assistant", content: [{ type: "text", text: "done" }] },
  ] as const;

  const safe = buildSafeRecentMessages(messages as never, 2);

  assert.equal(safe.length, 3);
  assert.equal(safe[0]?.role, "assistant");
  assert.equal(findHistoryWindowStart(messages as never, 2), 1);
});

test("buildSafeRecentMessages keeps ordinary suffix unchanged when no tool linkage would break", () => {
  const messages = [
    { role: "user", content: "a" },
    { role: "assistant", content: [{ type: "text", text: "b" }] },
    { role: "user", content: "c" },
    { role: "assistant", content: [{ type: "text", text: "d" }] },
  ] as const;

  const safe = buildSafeRecentMessages(messages as never, 2);

  assert.equal(safe.length, 2);
  assert.equal(safe[0]?.role, "user");
  assert.equal(safe[1]?.role, "assistant");
});
