import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAssistantMessage } from "../llm-stream-consumer.js";
import { StreamStepMessageBuilder } from "../stream-pipeline.js";
import { RATE_LIMIT_ASSISTANT_FALLBACK_TEXT } from "../prompt-sanitizer.js";

test("finalizeAssistantMessage uses rate-limit fallback text when stream error indicates quota", async () => {
  const builder = new StreamStepMessageBuilder();

  const message = await finalizeAssistantMessage({
    messageBuilder: builder,
    agent: {
      name: "copilot",
      instructions: "test",
    },
    idGenerator: {
      async next() {
        return "msg-1";
      },
    },
    allowTextToolFallback: true,
    lastFinishReason: null,
    streamError: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day",
    emitLog: () => undefined,
    stateMessageCount: 21,
  });

  assert.equal(Array.isArray(message.content), true);
  if (Array.isArray(message.content)) {
    assert.equal(message.content[0]?.type, "text");
    assert.equal(message.content[0]?.text, RATE_LIMIT_ASSISTANT_FALLBACK_TEXT);
  }
});

