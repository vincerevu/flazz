import test from "node:test";
import assert from "node:assert/strict";
import { checkOverflow } from "../overflow-detector.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBudget(compactionThreshold = 80_000, usableInputBudget = 100_000) {
  return {
    contextLimit: 128_000,
    outputReserve: 16_000,
    safetyBuffer: 8_000,
    usableInputBudget,
    compactionThreshold,
    targetPromptTokens: 55_000,
    recentMessagesBudget: 48_000,
    summaryReserve: 6_000,
    recompactCooldownMessages: 12,
    recompactCooldownTokens: 6_000,
    minimumSavingsTokens: 5_000,
    source: "registry" as const,
  };
}

// ─── Tests: source resolution ─────────────────────────────────────────────────

test("checkOverflow uses actual tokens when available", () => {
  const result = checkOverflow({
    actualTokens: 95_000,
    actualInputTokens: 90_000,
    estimatedTokens: 40_000,   // lower estimate — actual wins
    budget: makeBudget(),
  });
  assert.equal(result.usedTokens, 95_000);
  assert.equal(result.source, "actual");
});

test("checkOverflow falls back to estimated tokens when actual is absent", () => {
  const result = checkOverflow({
    actualInputTokens: undefined,
    estimatedTokens: 50_000,
    budget: makeBudget(),
  });
  assert.equal(result.usedTokens, 50_000);
  assert.equal(result.source, "estimated");
});

test("checkOverflow: actualInputTokens=0 is treated as actual (not fallback)", () => {
  // ?? does NOT treat 0 as absent — 0 is a valid value
  const result = checkOverflow({
    actualInputTokens: 0,
    estimatedTokens: 95_000,
    budget: makeBudget(80_000),
  });
  assert.equal(result.source, "actual");
  assert.equal(result.usedTokens, 0);
  assert.equal(result.isOverflow, false); // 0 < 80_000
});

// ─── Tests: overflow detection ────────────────────────────────────────────────

test("isOverflow is true when actual tokens exceed threshold", () => {
  const result = checkOverflow({
    actualInputTokens: 85_000,   // > threshold (80_000)
    estimatedTokens: 40_000,
    budget: makeBudget(80_000),
  });
  assert.equal(result.isOverflow, true);
});

test("isOverflow is false when actual tokens are below threshold", () => {
  const result = checkOverflow({
    actualInputTokens: 60_000,   // < threshold (80_000)
    estimatedTokens: 90_000,     // estimate would overflow but actual wins
    budget: makeBudget(80_000),
  });
  assert.equal(result.isOverflow, false);
});

test("isOverflow uses estimated when actual is absent", () => {
  const aboveThreshold = checkOverflow({
    actualInputTokens: undefined,
    estimatedTokens: 85_000,   // > threshold (80_000)
    budget: makeBudget(80_000),
  });
  assert.equal(aboveThreshold.isOverflow, true);

  const belowThreshold = checkOverflow({
    actualInputTokens: undefined,
    estimatedTokens: 50_000,   // < threshold (80_000)
    budget: makeBudget(80_000),
  });
  assert.equal(belowThreshold.isOverflow, false);
});

test("checkOverflow uses total-like actual tokens when provided", () => {
  const result = checkOverflow({
    actualTokens: 120_000,
    estimatedTokens: 60_000,
    budget: makeBudget(80_000),
  });

  assert.equal(result.source, "actual");
  assert.equal(result.usedTokens, 120_000);
  assert.equal(result.isOverflow, true);
});

test("isOverflow is true when actual tokens exactly equal threshold", () => {
  const result = checkOverflow({
    actualInputTokens: 80_000,
    estimatedTokens: 10_000,
    budget: makeBudget(80_000),
  });
  assert.equal(result.isOverflow, true);
});
