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

// ─── CompactionConfig override tests ─────────────────────────────────────────

test("CompactionConfig: compactionThreshold override is applied", () => {
  const base = resolveModelContextBudget({ flavor: "anthropic" }, "claude-sonnet-4");
  const overridden = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    { compactionThreshold: 50_000 }
  );
  assert.equal(overridden.compactionThreshold, 50_000);
  assert.notEqual(overridden.compactionThreshold, base.compactionThreshold);
  // Other fields should be unchanged
  assert.equal(overridden.contextLimit, base.contextLimit);
});

test("CompactionConfig: recompactCooldownMessages override is applied", () => {
  const overridden = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    { recompactCooldownMessages: 10 }
  );
  assert.equal(overridden.recompactCooldownMessages, 10);
});

test("CompactionConfig: minimumSavingsTokens override is applied", () => {
  const overridden = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    { minimumSavingsTokens: 1_000 }
  );
  assert.equal(overridden.minimumSavingsTokens, 1_000);
});

test("CompactionConfig: undefined config leaves defaults unchanged", () => {
  const noOverride = resolveModelContextBudget({ flavor: "anthropic" }, "claude-sonnet-4");
  const withUndefined = resolveModelContextBudget({ flavor: "anthropic" }, "claude-sonnet-4", undefined);
  assert.equal(withUndefined.compactionThreshold, noOverride.compactionThreshold);
  assert.equal(withUndefined.recompactCooldownMessages, noOverride.recompactCooldownMessages);
  assert.equal(withUndefined.minimumSavingsTokens, noOverride.minimumSavingsTokens);
});
