import test from "node:test";
import assert from "node:assert/strict";
import { AgentState } from "../agent-state.js";
import { RunEvent } from "@flazz/shared";
import { z } from "zod";
import {
  assessCompactionNeed,
  buildCompactionStartEvent,
} from "../compaction-orchestrator.js";

test("assessCompactionNeed triggers compaction at usable limit", () => {
  const state = new AgentState();
  state.messages = [{ role: "user", content: "x".repeat(2000) }] as never;

  const assessment = assessCompactionNeed({
    state,
    promptMessages: state.messages,
    operationalPromptSource: state.messages,
    instructions: "i".repeat(2000),
    tools: {},
    overflowCheck: {
      isOverflow: true,
      usedTokens: 1000,
      source: "estimated",
      availableBuffer: 0,
    },
    compactionConfig: { auto: true, prune: true },
    budget: {
      contextLimit: 1000,
      outputReserve: 100,
      safetyBuffer: 0,
      usableInputBudget: 800,
      compactionThreshold: 800,
      targetPromptTokens: 400,
      recentMessagesBudget: 200,
      summaryReserve: 50,
      recompactCooldownMessages: 12,
      recompactCooldownTokens: 100,
      minimumSavingsTokens: 50,
      source: "unknown",
    },
  });

  assert.equal(assessment.shouldCompact, true);
  assert.equal(assessment.mustCompactNow, true);
});

test("assessCompactionNeed defers when cooldown not satisfied and actual headroom remains", () => {
  const state = new AgentState();
  state.messages = [{ role: "user", content: "hello" }] as never;
  state.lastCompactionMessageCount = 1;
  state.lastCompactionEstimatedTokensAfter = 900;
  state.lastCompactionActualInputTokensAfter = 700;
  state.lastObservedInputTokens = 710;

  const assessment = assessCompactionNeed({
    state,
    promptMessages: state.messages,
    operationalPromptSource: state.messages,
    instructions: "brief",
    tools: {},
    overflowCheck: {
      isOverflow: true,
      usedTokens: 950,
      source: "estimated",
      availableBuffer: -50,
    },
    compactionConfig: { auto: true, prune: true },
    budget: {
      contextLimit: 1000,
      outputReserve: 100,
      safetyBuffer: 0,
      usableInputBudget: 980,
      compactionThreshold: 800,
      targetPromptTokens: 400,
      recentMessagesBudget: 200,
      summaryReserve: 50,
      recompactCooldownMessages: 12,
      recompactCooldownTokens: 100,
      minimumSavingsTokens: 50,
      source: "unknown",
    },
  });

  assert.equal(assessment.actualPromptSuggestsDeferringCompaction, true);
  assert.equal(assessment.shouldCompact, false);
});

test("assessCompactionNeed compacts immediately when actual usage reaches usable budget", () => {
  const state = new AgentState();
  state.messages = [{ role: "user", content: "hello" }] as never;
  state.lastCompactionMessageCount = 1;
  state.lastCompactionEstimatedTokensAfter = 900;
  state.lastCompactionActualInputTokensAfter = 700;
  state.lastObservedInputTokens = 1230;

  const assessment = assessCompactionNeed({
    state,
    promptMessages: state.messages,
    operationalPromptSource: state.messages,
    instructions: "brief",
    tools: {},
    overflowCheck: {
      isOverflow: true,
      usedTokens: 1230,
      source: "actual",
      availableBuffer: -430,
    },
    compactionConfig: { auto: true, prune: true },
    budget: {
      contextLimit: 1400,
      outputReserve: 100,
      safetyBuffer: 0,
      usableInputBudget: 1200,
      compactionThreshold: 800,
      targetPromptTokens: 400,
      recentMessagesBudget: 200,
      summaryReserve: 50,
      recompactCooldownMessages: 12,
      recompactCooldownTokens: 100,
      minimumSavingsTokens: 50,
      source: "unknown",
    },
  });

  assert.equal(assessment.actualInputTokens, 1230);
  assert.equal(assessment.mustCompactNow, true);
  assert.equal(assessment.shouldCompact, true);
});

test("assessCompactionNeed compacts immediately on actual overflow even before usable budget", () => {
  const state = new AgentState();
  state.messages = [{ role: "user", content: "hello" }] as never;
  state.lastCompactionMessageCount = 1;
  state.lastCompactionEstimatedTokensAfter = 900;
  state.lastCompactionActualInputTokensAfter = 700;
  state.lastObservedInputTokens = 860;

  const assessment = assessCompactionNeed({
    state,
    promptMessages: state.messages,
    operationalPromptSource: state.messages,
    instructions: "brief",
    tools: {},
    overflowCheck: {
      isOverflow: true,
      usedTokens: 860,
      source: "actual",
      availableBuffer: -60,
    },
    compactionConfig: { auto: true, prune: true },
    budget: {
      contextLimit: 1400,
      outputReserve: 100,
      safetyBuffer: 0,
      usableInputBudget: 1200,
      compactionThreshold: 800,
      targetPromptTokens: 400,
      recentMessagesBudget: 200,
      summaryReserve: 50,
      recompactCooldownMessages: 12,
      recompactCooldownTokens: 100,
      minimumSavingsTokens: 50,
      source: "unknown",
    },
  });

  assert.equal(assessment.mustCompactNow, false);
  assert.equal(assessment.shouldCompact, true);
});

test("buildCompactionStartEvent includes context budget source", () => {
  const state = new AgentState();
  state.messages = [{ role: "user", content: "hello" }] as never;

  const assessment = assessCompactionNeed({
    state,
    promptMessages: state.messages,
    operationalPromptSource: state.messages,
    instructions: "brief",
    tools: {},
    overflowCheck: {
      isOverflow: true,
      usedTokens: 1000,
      source: "estimated",
      availableBuffer: 0,
    },
    compactionConfig: { auto: true, prune: true },
    budget: {
      contextLimit: 2000,
      outputReserve: 200,
      safetyBuffer: 0,
      usableInputBudget: 1800,
      compactionThreshold: 1800,
      targetPromptTokens: 900,
      recentMessagesBudget: 400,
      summaryReserve: 50,
      recompactCooldownMessages: 12,
      recompactCooldownTokens: 100,
      minimumSavingsTokens: 50,
      source: "registry",
    },
  });

  const event = buildCompactionStartEvent({
    runId: "run-1",
    compactionId: "cmp-1",
    assessment,
    messageCountBefore: 1,
    budget: {
      contextLimit: 2000,
      outputReserve: 200,
      safetyBuffer: 0,
      usableInputBudget: 1800,
      compactionThreshold: 1800,
      targetPromptTokens: 900,
      recentMessagesBudget: 400,
      summaryReserve: 50,
      recompactCooldownMessages: 12,
      recompactCooldownTokens: 100,
      minimumSavingsTokens: 50,
      source: "registry",
    },
  }) as Extract<z.infer<typeof RunEvent>, { type: "context-compaction-start" }>;

  assert.equal(event.contextBudgetSource, "registry");
});
