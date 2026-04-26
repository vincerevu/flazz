import test from "node:test";
import assert from "node:assert/strict";
import { estimatePromptTokens, resolveModelContextBudget } from "../model-context-budget.js";

test("resolveModelContextBudget returns Claude-sized budget", () => {
  const budget = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    undefined,
    {
      context: 200_000,
      output: 16_000,
    },
    "registry",
  );
  assert.equal(budget.contextLimit, 200_000);
  assert.equal(budget.compactionThreshold, budget.usableInputBudget);
  assert.ok(budget.targetPromptTokens < budget.compactionThreshold);
  assert.ok(budget.recentMessagesBudget < budget.usableInputBudget);
  assert.equal(budget.source, "registry");
});

test("resolveModelContextBudget uses conservative unknown budget for unknown models", () => {
  const budget = resolveModelContextBudget({ flavor: "requesty" }, "mystery-model");
  assert.equal(budget.contextLimit, 64_000);
  assert.equal(budget.source, "unknown");
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

test("resolveModelContextBudget uses explicit model limits when provided", () => {
  const budget = resolveModelContextBudget(
    { flavor: "openai-compatible" },
    "custom-model",
    undefined,
    {
      context: 256_000,
      input: 240_000,
      output: 32_000,
    },
    "config",
  );

  assert.equal(budget.contextLimit, 256_000);
  assert.equal(budget.outputReserve, 32_000);
  assert.equal(budget.compactionThreshold, budget.usableInputBudget);
  assert.equal(budget.usableInputBudget, 220_000);
  assert.equal(budget.source, "config");
});

test("resolveModelContextBudget mirrors OpenCode-style usable budget when only context/output limits are known", () => {
  const budget = resolveModelContextBudget(
    { flavor: "openai-compatible" },
    "oc/minimax-m2.5-free",
    undefined,
    {
      context: 204_800,
      output: 131_072,
    },
    "config",
  );

  assert.equal(budget.contextLimit, 204_800);
  assert.equal(budget.outputReserve, 131_072);
  assert.equal(budget.usableInputBudget, 73_728);
  assert.equal(budget.compactionThreshold, 73_728);
  assert.equal(budget.source, "config");
});

// ─── CompactionConfig override tests ─────────────────────────────────────────

test("CompactionConfig: compactionThreshold override is applied", () => {
  const base = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    undefined,
    { context: 200_000, output: 16_000 },
    "registry",
  );
  const overridden = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    { compactionThreshold: 50_000 },
    { context: 200_000, output: 16_000 },
    "registry",
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
    { recompactCooldownMessages: 10 },
    { context: 200_000, output: 16_000 },
    "registry",
  );
  assert.equal(overridden.recompactCooldownMessages, 10);
});

test("CompactionConfig: minimumSavingsTokens override is applied", () => {
  const overridden = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    { minimumSavingsTokens: 1_000 },
    { context: 200_000, output: 16_000 },
    "registry",
  );
  assert.equal(overridden.minimumSavingsTokens, 1_000);
});

test("CompactionConfig: undefined config leaves defaults unchanged", () => {
  const noOverride = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    undefined,
    { context: 200_000, output: 16_000 },
    "registry",
  );
  const withUndefined = resolveModelContextBudget(
    { flavor: "anthropic" },
    "claude-sonnet-4",
    undefined,
    { context: 200_000, output: 16_000 },
    "registry",
  );
  assert.equal(withUndefined.compactionThreshold, noOverride.compactionThreshold);
  assert.equal(withUndefined.recompactCooldownMessages, noOverride.recompactCooldownMessages);
  assert.equal(withUndefined.minimumSavingsTokens, noOverride.minimumSavingsTokens);
});
