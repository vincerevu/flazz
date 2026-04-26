import { MessageList, RunEvent } from "@flazz/shared";
import { z } from "zod";
import { AgentState } from "./agent-state.js";
import type { CompactionAssessment, RuntimeCompactionConfig } from "./compaction-orchestrator.js";
import { buildCompactionFailedEvent } from "./compaction-orchestrator.js";
import type { ModelContextBudget } from "./model-context-budget.js";
import { prepareCompactedContext } from "./context-compaction.js";
import { pruneToolOutputs } from "./context-pruner.js";
import { buildPostCompactionMessages, getCompactionReason, promptContainsAttachments } from "./compaction-policy.js";

export async function executeCompaction(args: {
  runId: string;
  compactionId: string;
  assessment: CompactionAssessment;
  budget: ModelContextBudget;
  promptMessages: z.infer<typeof MessageList>;
  safeRecentMessages: z.infer<typeof MessageList>;
  state: AgentState;
  model: unknown;
  signal?: AbortSignal;
  compactionConfig: RuntimeCompactionConfig;
  messageCountBefore: number;
  processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
  nextMessageId: () => Promise<string>;
  log: (message: string) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  categorizeError: (error: unknown) => "abort" | "provider" | "invalid-response" | "parse" | "other";
}): Promise<{ modelMessages: z.infer<typeof MessageList> }> {
  const estimatedTokensBefore = args.assessment.estimatedPromptTokens;

  try {
    const pruneResult = args.compactionConfig.prune
      ? pruneToolOutputs(args.promptMessages)
      : { messages: args.promptMessages, prunedCount: 0, tokensSaved: 0 };
    if (pruneResult.prunedCount > 0) {
      args.log(
        `pruned ${pruneResult.prunedCount} tool results, saved ~${pruneResult.tokensSaved} tokens`
      );
      for await (const event of args.processEvent(RunEvent.parse({
        runId: args.runId,
        type: "context-pruned",
        prunedCount: pruneResult.prunedCount,
        tokensSaved: pruneResult.tokensSaved,
        estimatedTokensAfter: Math.max(0, estimatedTokensBefore - pruneResult.tokensSaved),
        subflow: [],
        ts: new Date().toISOString(),
      }))) {
        void event;
      }
    }

    const messagesForCompaction = pruneResult.messages;
    const compactionReason = getCompactionReason(args.promptMessages, {
      overflow: promptContainsAttachments(args.promptMessages),
    });

    let compacted = await prepareCompactedContext({
      messages: messagesForCompaction,
      model: args.model as never,
      signal: args.signal,
      recentBudgetTokens: args.budget.recentMessagesBudget,
      previousSummary: args.state.compactedContextSummary,
      previousAnchorHash: args.state.compactedContextAnchorHash,
      previousCarryover: args.state.compactedContextCarryover,
      previousTaskState: args.state.compactedTaskState,
      pendingToolCallIds: args.state.getPendingToolCallIds(),
      referenceHints: args.state.compactedTaskState?.references ?? [],
      reason: compactionReason,
      skipPrune: true,
    });
    let escalated = false;

    if (compacted.snapshot) {
      const landedNearTarget = compacted.snapshot.estimatedTokensAfter <= args.budget.targetPromptTokens;
      const savedEnough = compacted.snapshot.tokensSaved >= args.budget.minimumSavingsTokens;
      if (!landedNearTarget && !savedEnough) {
        escalated = true;
        args.log(
          `escalating compaction: after=${compacted.snapshot.estimatedTokensAfter} ` +
          `target=${args.budget.targetPromptTokens} saved=${compacted.snapshot.tokensSaved}`
        );

        compacted = await prepareCompactedContext({
          messages: messagesForCompaction,
          model: args.model as never,
          signal: args.signal,
          recentBudgetTokens: Math.max(8_000, Math.floor(args.budget.recentMessagesBudget * 0.7)),
          previousSummary: args.state.compactedContextSummary,
          previousAnchorHash: args.state.compactedContextAnchorHash,
          previousCarryover: args.state.compactedContextCarryover,
          previousTaskState: args.state.compactedTaskState,
          pendingToolCallIds: args.state.getPendingToolCallIds(),
          referenceHints: args.state.compactedTaskState?.references ?? [],
          reason: compactionReason,
          skipPrune: true,
        });
      }
    }

    const modelMessages = compacted.messages;

    if (compacted.snapshot) {
      const landedNearTarget = compacted.snapshot.estimatedTokensAfter <= args.budget.targetPromptTokens;
      const savedEnough = compacted.snapshot.tokensSaved >= args.budget.minimumSavingsTokens;
      args.log(
        `compacted history: ${compacted.snapshot.omittedMessages} older messages summarized, ` +
        `${args.messageCountBefore} -> ${modelMessages.length} prompt messages ` +
        `(saved=${compacted.snapshot.tokensSaved}, target=${args.budget.targetPromptTokens}, ` +
        `landed=${landedNearTarget}, minSaved=${args.budget.minimumSavingsTokens})`
      );
      for await (const event of args.processEvent({
        runId: args.runId,
        type: "context-compaction-complete",
        compactionId: args.compactionId,
        strategy: "summary-window",
        escalated,
        summary: compacted.snapshot.summary,
        anchorHash: compacted.snapshot.anchorHash,
        provenanceRefs: compacted.snapshot.provenanceRefs,
        omittedMessages: compacted.snapshot.omittedMessages,
        recentMessages: compacted.snapshot.recentMessages,
        messageCountBefore: args.messageCountBefore,
        messageCountAfter: modelMessages.length,
        estimatedTokensBefore: compacted.snapshot.estimatedTokensBefore,
        estimatedTokensAfter: compacted.snapshot.estimatedTokensAfter,
        tokensSaved: compacted.snapshot.tokensSaved,
        reductionPercent: compacted.snapshot.reductionPercent,
        recentWindowStart: compacted.snapshot.recentWindowStart,
        protectedWindowReasons: compacted.snapshot.protectedWindowReasons,
        operationalMessageCountAfter: compacted.snapshot.operationalMessageCountAfter,
        baselineMode: compacted.snapshot.baselineMode,
        contextLimit: args.budget.contextLimit,
        usableInputBudget: args.budget.usableInputBudget,
        compactionThreshold: args.budget.compactionThreshold,
        targetThreshold: args.budget.targetPromptTokens,
        contextBudgetSource: args.budget.source,
        reused: compacted.snapshot.reused,
        subflow: [],
        ts: new Date().toISOString(),
      } as z.infer<typeof RunEvent>)) {
        void event;
      }

      for (const followUpMessage of buildPostCompactionMessages({
        promptMessages: args.promptMessages,
        reason: compacted.autoContinue ?? compactionReason,
      })) {
        for await (const event of args.processEvent({
          runId: args.runId,
          messageId: await args.nextMessageId(),
          type: "message",
          message: followUpMessage,
          subflow: [],
        })) {
          void event;
        }
        modelMessages.push(followUpMessage);
      }

      if (!landedNearTarget || !savedEnough) {
        args.log(
          `compaction under target: after=${compacted.snapshot.estimatedTokensAfter} ` +
          `target=${args.budget.targetPromptTokens} saved=${compacted.snapshot.tokensSaved}`
        );
      }
    }

    return { modelMessages };
  } catch (error) {
    const compactionError = error instanceof Error ? error.message : "Context compaction failed";
    const failureCategory = args.categorizeError(error);
    args.warn("context compaction failed", {
      error: compactionError,
      failureCategory,
      messages: args.state.messages.length,
    });
    for await (const event of args.processEvent(buildCompactionFailedEvent({
      runId: args.runId,
      compactionId: args.compactionId,
      assessment: args.assessment,
      messageCountBefore: args.messageCountBefore,
      budget: args.budget,
      error: compactionError,
      failureCategory,
    }))) {
      void event;
    }
    args.log(`falling back to safe recent history: ${args.messageCountBefore} -> ${args.safeRecentMessages.length} messages`);
    return { modelMessages: args.safeRecentMessages };
  }
}
