import assert from "node:assert/strict";
import test from "node:test";
import { hasVisibleAssistantOutput } from "../stream-pipeline.js";

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
