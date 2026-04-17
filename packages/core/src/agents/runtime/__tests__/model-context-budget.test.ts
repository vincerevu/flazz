import test from "node:test";
import assert from "node:assert/strict";
import { estimatePromptTokens, resolveModelContextBudget } from "../model-context-budget.js";

test("resolveModelContextBudget returns Claude-sized budget", () => {
  const budget = resolveModelContextBudget({ flavor: "anthropic" }, "claude-sonnet-4") ;
  assert.equal(budget.contextLimit, 200_000);
  assert.ok(budget.compactionThreshold < budget.usableInputBudget);
  assert.ok(budget.targetPromptTokens < budget.compactionThreshold);
  assert.ok(budget.recentMessagesBudget < budget.usableInputBudget);
});

test("resolveModelContextBudget falls back safely for unknown models", () => {
  const budget = resolveModelContextBudget({ flavor: "requesty" }, "mystery-model");
  assert.equal(budget.contextLimit, 128_000);
  assert.equal(budget.source, "fallback");
  assert.ok(budget.minimumSavingsTokens > 0);
});

test("estimatePromptTokens includes messages, instructions, and tool schema", () => {
  const estimate = estimatePromptTokens({
    messages: [{ role: "user", content: "hello there" }] as never,
    instructions: "You are helpful.",
    tools: {
      search: {
        description: "Search the web",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      },
    } as never,
  });

  assert.ok(estimate > 0);
});
