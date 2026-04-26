import { MessageList, RunEvent } from "@flazz/shared";
import { z } from "zod";
import { AgentState } from "./agent-state.js";
import { buildCompactionCooldownLog, buildCompactionStartEvent, type CompactionAssessment, type RuntimeCompactionConfig } from "./compaction-orchestrator.js";
import type { ModelContextBudget } from "./model-context-budget.js";
import { executeCompaction } from "./compaction-executor.js";

export const MAX_CONSECUTIVE_COMPACTION_FAILURES = 3;

export async function runCompactionPhase(args: {
  runId: string;
  state: AgentState;
  assessment: CompactionAssessment;
  overflowed: boolean;
  budget: ModelContextBudget;
  promptMessages: z.infer<typeof MessageList>;
  safeRecentMessages: z.infer<typeof MessageList>;
  modelMessages: z.infer<typeof MessageList>;
  model: unknown;
  signal?: AbortSignal;
  compactionConfig: RuntimeCompactionConfig;
  processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
  emitStatus: (
    phase: "checking" | "running-tool" | "preparing-context" | "checking-context" | "compacting-context" | "waiting-for-model" | "processing-response" | "finalizing",
    message: string,
    toolName?: string,
  ) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
  nextId: () => Promise<string>;
  log: (message: string) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  categorizeError: (error: unknown) => "abort" | "provider" | "invalid-response" | "parse" | "other";
}): Promise<{ modelMessages: z.infer<typeof MessageList> }> {
  if (!args.assessment.shouldCompact) {
    if (args.overflowed) {
      args.log(buildCompactionCooldownLog({
        assessment: args.assessment,
        budget: args.budget,
      }));
    }
    return { modelMessages: args.modelMessages };
  }

  if (args.state.consecutiveCompactionFailures >= MAX_CONSECUTIVE_COMPACTION_FAILURES) {
    args.warn("compaction circuit breaker open — skipping compaction this turn", {
      consecutiveFailures: args.state.consecutiveCompactionFailures,
    });
    return { modelMessages: args.safeRecentMessages };
  }

  for await (const event of args.emitStatus("compacting-context", "Compacting context...")) {
    void event;
  }
  const compactionId = await args.nextId();
  const messageCountBefore = args.promptMessages.length;

  args.log(
    `preparing context compaction: est=${args.assessment.estimatedPromptTokens} threshold=${args.budget.compactionThreshold} `
    + `target=${args.budget.targetPromptTokens} usable=${args.budget.usableInputBudget} context=${args.budget.contextLimit}`,
  );
  for await (const event of args.processEvent(buildCompactionStartEvent({
    runId: args.runId,
    compactionId,
    assessment: args.assessment,
    messageCountBefore,
    budget: args.budget,
  }))) {
    void event;
  }

  const compactionResult = await executeCompaction({
    runId: args.runId,
    compactionId,
    assessment: args.assessment,
    budget: args.budget,
    promptMessages: args.promptMessages,
    safeRecentMessages: args.safeRecentMessages,
    state: args.state,
    model: args.model,
    signal: args.signal,
    compactionConfig: args.compactionConfig,
    messageCountBefore,
    processEvent: args.processEvent,
    nextMessageId: args.nextId,
    log: args.log,
    warn: args.warn,
    categorizeError: args.categorizeError,
  });

  if (args.state.consecutiveCompactionFailures >= MAX_CONSECUTIVE_COMPACTION_FAILURES) {
    args.warn(
      `compaction circuit breaker open after ${args.state.consecutiveCompactionFailures} consecutive failures — compaction disabled for this run`,
      { consecutiveFailures: args.state.consecutiveCompactionFailures },
    );
  }

  return { modelMessages: compactionResult.modelMessages };
}
