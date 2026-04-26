import test from "node:test";
import assert from "node:assert/strict";
import {
  createMessageEvent,
  createRunStatusEvent,
  createUsageUpdateEvent,
} from "../runtime-events.js";

test("createRunStatusEvent builds a valid run-status payload", () => {
  const event = createRunStatusEvent({
    runId: "run-1",
    phase: "checking-context",
    message: "Checking context window...",
    contextDebug: {
      providerFlavor: "openai-compatible",
      modelId: "minimax-m2.5-free",
      contextLimit: 204800,
      usableInputBudget: 184800,
      outputReserve: 131072,
      compactionThreshold: 184800,
      targetThreshold: 101640,
      estimatedPromptTokens: 52000,
      overflowSource: "estimated",
      budgetSource: "registry",
    },
  });

  assert.equal(event.type, "run-status");
  assert.equal(event.phase, "checking-context");
  assert.equal(event.contextDebug?.budgetSource, "registry");
});

test("createUsageUpdateEvent builds a valid usage update payload", () => {
  const event = createUsageUpdateEvent({
    runId: "run-1",
    usage: { inputTokens: 10, outputTokens: 20 },
    finishReason: "stop",
  });

  assert.equal(event.type, "usage-update");
  assert.equal(event.usage.inputTokens, 10);
});

test("createMessageEvent wraps a message as a run event", () => {
  const event = createMessageEvent({
    runId: "run-1",
    messageId: "msg-1",
    message: { role: "user", content: "hello" },
  });

  assert.equal(event.type, "message");
  assert.equal(event.message.role, "user");
});
