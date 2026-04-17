import test from "node:test";
import assert from "node:assert/strict";
import { deriveRunCompactionMetrics } from "../context-metrics.js";

test("deriveRunCompactionMetrics aggregates attempts, savings, and escalations", () => {
  const metrics = deriveRunCompactionMetrics([
    {
      runId: "run-1",
      type: "context-compaction-start",
      compactionId: "c1",
      strategy: "summary-window",
      escalated: false,
      messageCountBefore: 40,
      estimatedTokensBefore: 100_000,
      contextLimit: 128_000,
      usableInputBudget: 116_000,
      compactionThreshold: 95_000,
      targetThreshold: 64_000,
      subflow: [],
    },
    {
      runId: "run-1",
      type: "context-compaction-complete",
      compactionId: "c1",
      strategy: "summary-window",
      escalated: true,
      summary: "summary",
      anchorHash: "abc",
      omittedMessages: 20,
      recentMessages: 10,
      messageCountBefore: 40,
      messageCountAfter: 11,
      estimatedTokensBefore: 100_000,
      estimatedTokensAfter: 60_000,
      tokensSaved: 40_000,
      reductionPercent: 40,
      contextLimit: 128_000,
      usableInputBudget: 116_000,
      compactionThreshold: 95_000,
      targetThreshold: 64_000,
      provenanceRefs: ["tool:web-search"],
      subflow: [],
    },
  ] as never);

  assert.equal(metrics.totalAttempts, 1);
  assert.equal(metrics.completedCompactions, 1);
  assert.equal(metrics.escalatedCompactions, 1);
  assert.equal(metrics.totalTokensSaved, 40_000);
  assert.equal(metrics.averageReductionPercent, 40);
});
