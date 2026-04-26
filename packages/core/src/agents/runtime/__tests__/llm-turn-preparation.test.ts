import test from "node:test";
import assert from "node:assert/strict";
import { buildCompatibilityNote, extractFirstUserQuery, extractMessageText } from "../llm-turn-preparation.js";

test("extractMessageText returns plain string content unchanged", () => {
  assert.equal(
    extractMessageText({ role: "user", content: "hello" } as never),
    "hello",
  );
});

test("extractFirstUserQuery joins text parts from structured content", () => {
  const query = extractFirstUserQuery([
    {
      role: "assistant",
      content: "ignored",
    },
    {
      role: "user",
      content: [
        { type: "text", text: "first" },
        { type: "tool-call", toolCallId: "tc-1", toolName: "demo", args: {} },
        { type: "text", text: "second" },
      ],
    },
  ] as never);

  assert.equal(query, "first  second");
});

test("buildCompatibilityNote only renders when tools are requested but disabled", () => {
  assert.match(
    buildCompatibilityNote({
      toolExecutionMode: "disabled",
      requestedToolCount: 2,
    }),
    /Tool execution is disabled/,
  );

  assert.equal(
    buildCompatibilityNote({
      toolExecutionMode: "full",
      requestedToolCount: 2,
    }),
    "",
  );
});
