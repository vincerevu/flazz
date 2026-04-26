import { MessageList, RunEvent } from "@flazz/shared";
import { z } from "zod";
import { AgentState } from "./agent-state.js";
import { estimatePromptTokens } from "./model-context-budget.js";
import type { ModelContextBudget } from "./model-context-budget.js";
import type { OverflowCheckResult } from "./overflow-detector.js";

export type RuntimeCompactionConfig = {
  auto: boolean;
  prune: boolean;
  reservedTokens?: number;
};

export type CompactionAssessment = {
  estimatedPromptTokens: number;
  actualInputTokens: number | null;
  baselineMode: "full-history" | "summary-recent-window";
  operationalMessageCountBefore: number;
  messagesSinceLastCompaction: number;
  estimatedTokenGrowthSinceLastCompaction: number;
  actualTokenGrowthSinceLastCompaction: number | null;
  messageCooldownSatisfied: boolean;
  tokenCooldownSatisfied: boolean;
  mustCompactNow: boolean;
  actualPromptSuggestsDeferringCompaction: boolean;
  shouldCompact: boolean;
};

export function assessCompactionNeed(args: {
  state: AgentState;
  promptMessages: z.infer<typeof MessageList>;
  operationalPromptSource: z.infer<typeof MessageList>;
  instructions: string;
  tools: Record<string, unknown>;
  budget: ModelContextBudget;
  overflowCheck: OverflowCheckResult;
  compactionConfig: RuntimeCompactionConfig;
}): CompactionAssessment {
  const estimatedPromptTokens = estimatePromptTokens({
    messages: args.promptMessages,
    instructions: args.instructions,
    tools: args.tools as never,
  });
  const actualInputTokens = args.overflowCheck.source === "actual"
    ? args.overflowCheck.usedTokens
    : null;

  const baselineMode = args.state.compactedOperationalBaseline ? "summary-recent-window" : "full-history";
  const operationalMessageCountBefore = args.operationalPromptSource.length;
  const messagesSinceLastCompaction = args.state.lastCompactionMessageCount == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, args.state.messages.length - args.state.lastCompactionMessageCount);
  const estimatedTokenGrowthSinceLastCompaction = args.state.lastCompactionEstimatedTokensAfter == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, estimatedPromptTokens - args.state.lastCompactionEstimatedTokensAfter);
  const actualTokenGrowthSinceLastCompaction = (
    args.state.lastCompactionActualInputTokensAfter == null
    || args.state.lastObservedInputTokens == null
  )
    ? null
    : Math.max(0, args.state.lastObservedInputTokens - args.state.lastCompactionActualInputTokensAfter);
  const messageCooldownSatisfied = messagesSinceLastCompaction >= args.budget.recompactCooldownMessages;
  const tokenCooldownSatisfied = estimatedTokenGrowthSinceLastCompaction >= args.budget.recompactCooldownTokens
    || (actualTokenGrowthSinceLastCompaction != null
      && actualTokenGrowthSinceLastCompaction >= args.budget.recompactCooldownTokens);
  const mustCompactNow = estimatedPromptTokens >= args.budget.usableInputBudget
    || (actualInputTokens != null && actualInputTokens >= args.budget.usableInputBudget);
  const actualPromptSuggestsDeferringCompaction = (
    args.overflowCheck.source === "estimated"
    && !mustCompactNow
    && args.state.lastObservedInputTokens != null
    && args.state.lastObservedInputTokens < Math.max(0, args.budget.compactionThreshold - Math.floor(args.budget.recompactCooldownTokens / 2))
    && actualTokenGrowthSinceLastCompaction != null
    && actualTokenGrowthSinceLastCompaction < args.budget.recompactCooldownTokens
  );
  const shouldCompact = args.compactionConfig.auto
    && args.overflowCheck.isOverflow
    && (
      args.overflowCheck.source === "actual"
      || (
        !actualPromptSuggestsDeferringCompaction
        && (messageCooldownSatisfied || tokenCooldownSatisfied || mustCompactNow)
      )
    );

  return {
    estimatedPromptTokens,
    actualInputTokens,
    baselineMode,
    operationalMessageCountBefore,
    messagesSinceLastCompaction,
    estimatedTokenGrowthSinceLastCompaction,
    actualTokenGrowthSinceLastCompaction,
    messageCooldownSatisfied,
    tokenCooldownSatisfied,
    mustCompactNow,
    actualPromptSuggestsDeferringCompaction,
    shouldCompact,
  };
}

export function buildCompactionCooldownLog(args: {
  assessment: CompactionAssessment;
  budget: ModelContextBudget;
}): string {
  const { assessment, budget } = args;
  return (
    `skipping compaction due to cooldown: est=${assessment.estimatedPromptTokens} ` +
    `messagesSinceLast=${assessment.messagesSinceLastCompaction}/${budget.recompactCooldownMessages} ` +
    `estimatedTokenGrowth=${assessment.estimatedTokenGrowthSinceLastCompaction}/${budget.recompactCooldownTokens}` +
    `${assessment.actualTokenGrowthSinceLastCompaction == null ? "" : ` actualTokenGrowth=${assessment.actualTokenGrowthSinceLastCompaction}/${budget.recompactCooldownTokens}`}` +
    `${assessment.actualPromptSuggestsDeferringCompaction ? " deferredByActualPromptHeadroom=true" : ""}`
  );
}

export function buildCompactionStartEvent(args: {
  runId: string;
  compactionId: string;
  assessment: CompactionAssessment;
  messageCountBefore: number;
  budget: ModelContextBudget;
}): z.infer<typeof RunEvent> {
  return RunEvent.parse({
    runId: args.runId,
    type: "context-compaction-start",
    compactionId: args.compactionId,
    strategy: "summary-window",
    escalated: false,
    baselineMode: args.assessment.baselineMode,
    messageCountBefore: args.messageCountBefore,
    operationalMessageCountBefore: args.assessment.operationalMessageCountBefore,
    estimatedTokensBefore: args.assessment.estimatedPromptTokens,
    messagesSinceLastCompaction: Number.isFinite(args.assessment.messagesSinceLastCompaction)
      ? args.assessment.messagesSinceLastCompaction
      : undefined,
    estimatedTokenGrowthSinceLastCompaction: Number.isFinite(args.assessment.estimatedTokenGrowthSinceLastCompaction)
      ? args.assessment.estimatedTokenGrowthSinceLastCompaction
      : undefined,
    actualTokenGrowthSinceLastCompaction: args.assessment.actualTokenGrowthSinceLastCompaction ?? undefined,
    contextLimit: args.budget.contextLimit,
    usableInputBudget: args.budget.usableInputBudget,
    compactionThreshold: args.budget.compactionThreshold,
    targetThreshold: args.budget.targetPromptTokens,
    contextBudgetSource: args.budget.source,
    subflow: [],
    ts: new Date().toISOString(),
  });
}

export function buildCompactionFailedEvent(args: {
  runId: string;
  compactionId: string;
  assessment: CompactionAssessment;
  messageCountBefore: number;
  budget: ModelContextBudget;
  error: string;
  failureCategory: "abort" | "provider" | "invalid-response" | "parse" | "other";
}): z.infer<typeof RunEvent> {
  return RunEvent.parse({
    runId: args.runId,
    type: "context-compaction-failed",
    compactionId: args.compactionId,
    strategy: "summary-window",
    escalated: false,
    error: args.error,
    failureCategory: args.failureCategory,
    baselineMode: args.assessment.baselineMode,
    messageCountBefore: args.messageCountBefore,
    operationalMessageCountBefore: args.assessment.operationalMessageCountBefore,
    estimatedTokensBefore: args.assessment.estimatedPromptTokens,
    messagesSinceLastCompaction: Number.isFinite(args.assessment.messagesSinceLastCompaction)
      ? args.assessment.messagesSinceLastCompaction
      : undefined,
    estimatedTokenGrowthSinceLastCompaction: Number.isFinite(args.assessment.estimatedTokenGrowthSinceLastCompaction)
      ? args.assessment.estimatedTokenGrowthSinceLastCompaction
      : undefined,
    actualTokenGrowthSinceLastCompaction: args.assessment.actualTokenGrowthSinceLastCompaction ?? undefined,
    contextLimit: args.budget.contextLimit,
    usableInputBudget: args.budget.usableInputBudget,
    compactionThreshold: args.budget.compactionThreshold,
    targetThreshold: args.budget.targetPromptTokens,
    contextBudgetSource: args.budget.source,
    subflow: [],
    ts: new Date().toISOString(),
  });
}
