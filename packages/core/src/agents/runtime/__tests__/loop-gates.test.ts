import test from "node:test";
import assert from "node:assert/strict";
import { AgentState } from "../agent-state.js";
import { shouldExitAfterAssistantResponse, shouldExitForPendingRequests } from "../loop-gates.js";

test("shouldExitForPendingRequests returns true when pending ask-human exists", () => {
  const state = new AgentState();
  state.pendingAskHumanRequests["tc-1"] = {
    runId: "run-1",
    type: "ask-human-request",
    toolCallId: "tc-1",
    question: "Need approval?",
    subflow: [],
    ts: new Date().toISOString(),
  } as never;

  assert.equal(shouldExitForPendingRequests(state), true);
});

test("shouldExitAfterAssistantResponse returns true for assistant text-only output", () => {
  assert.equal(
    shouldExitAfterAssistantResponse([
      { role: "assistant", content: "done" },
    ] as never),
    true,
  );
});

test("shouldExitAfterAssistantResponse returns false when assistant still has tool calls", () => {
  assert.equal(
    shouldExitAfterAssistantResponse([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-1",
            toolName: "search",
            arguments: {},
          },
        ],
      },
    ] as never),
    false,
  );
});
