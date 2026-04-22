import assert from "node:assert/strict";
import test from "node:test";
import { convertFromMessages, hasVisibleAssistantOutput, normalizeToolCallInput } from "../stream-pipeline.js";

test("hasVisibleAssistantOutput ignores reasoning-only assistant content", () => {
  assert.equal(
    hasVisibleAssistantOutput({
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "I should inspect the search results before answering.",
        },
      ],
    }),
    false,
  );
});

test("hasVisibleAssistantOutput accepts non-empty text content", () => {
  assert.equal(
    hasVisibleAssistantOutput({
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Here are the key findings.",
        },
      ],
    }),
    true,
  );
});

test("normalizeToolCallInput coerces non-object inputs to empty object", () => {
  assert.deepEqual(normalizeToolCallInput(""), {});
  assert.deepEqual(normalizeToolCallInput(null), {});
  assert.deepEqual(normalizeToolCallInput([]), {});
  assert.deepEqual(normalizeToolCallInput({ path: "file.txt" }), { path: "file.txt" });
});

test("convertFromMessages sanitizes assistant tool-call arguments before provider conversion", () => {
  const converted = convertFromMessages([
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "workspace-writeFile",
          arguments: "",
        },
      ],
    },
  ]);

  assert.deepEqual(converted, [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "workspace-writeFile",
          input: {},
        },
      ],
    },
  ]);
});
