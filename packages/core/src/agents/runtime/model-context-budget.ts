import { ToolSet } from "ai";
import { LlmModelLimits, MessageList } from "@flazz/shared";
import { z } from "zod";
import { estimateMessagesTokens } from "./context-compaction.js";
import type { LlmProvider } from "@flazz/shared";

const DEFAULT_UNKNOWN_CONTEXT_LIMIT = 64_000;
const DEFAULT_UNKNOWN_OUTPUT_RESERVE = 8_192;
const DEFAULT_COMPACTION_RESERVED = 20_000;
const DEFAULT_TARGET_THRESHOLD_RATIO = 0.55;
const MIN_RECENT_BUDGET = 32_000;
const DEFAULT_RECOMPACTION_COOLDOWN_MESSAGES = 12;
const MINIMUM_COMPACTION_SAVINGS_RATIO = 0.12;

export type ModelContextBudget = {
  contextLimit: number;
  outputReserve: number;
  safetyBuffer: number;
  usableInputBudget: number;
  compactionThreshold: number;
  targetPromptTokens: number;
  recentMessagesBudget: number;
  summaryReserve: number;
  recompactCooldownMessages: number;
  recompactCooldownTokens: number;
  minimumSavingsTokens: number;
  source: "config" | "registry" | "unknown";
};

/**
 * Optional per-agent overrides for context compaction thresholds.
 * All values are in tokens. Only the fields provided are applied;
 * the rest fall back to the model-derived defaults.
 */
export type CompactionConfig = {
  /** Enable or disable automatic compaction. */
  auto?: boolean;
  /** Enable or disable prune-before-compact. */
  prune?: boolean;
  /** Override the reserved output buffer before compaction triggers. */
  reservedTokens?: number;
  /** Override the token count at which compaction is triggered. */
  compactionThreshold?: number;
  /** Override the target token count after compaction. */
  targetPromptTokens?: number;
  /** Override the cooldown (in messages) between compactions. */
  recompactCooldownMessages?: number;
  /** Override the minimum token savings required to bother compacting. */
  minimumSavingsTokens?: number;
};

type Provider = z.infer<typeof LlmProvider>;
type ExplicitModelLimits = z.infer<typeof LlmModelLimits>;

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, next) => {
    if (typeof next === "function") return undefined;
    if (!next || typeof next !== "object") return next;
    if (seen.has(next)) return "[Circular]";
    seen.add(next);
    return next;
  }) ?? "";
}

export function resolveModelContextBudget(
  provider: Provider,
  modelId: string,
  config?: CompactionConfig,
  explicitLimits?: ExplicitModelLimits,
  limitSource?: "config" | "registry",
): ModelContextBudget {
  void provider;
  void modelId;
  const contextLimit = explicitLimits?.context ?? DEFAULT_UNKNOWN_CONTEXT_LIMIT;
  const outputReserve = explicitLimits?.output ?? DEFAULT_UNKNOWN_OUTPUT_RESERVE;
  const reserved = Math.min(
    config?.reservedTokens ?? DEFAULT_COMPACTION_RESERVED,
    outputReserve || DEFAULT_UNKNOWN_OUTPUT_RESERVE,
  );
  const safetyBuffer = 0;
  const maxOutputTokens = outputReserve || DEFAULT_UNKNOWN_OUTPUT_RESERVE;

  const usableInputBudget = Math.max(
    8_000,
    explicitLimits?.input
      ? explicitLimits.input - reserved
      : contextLimit - maxOutputTokens,
  );

  const defaultCompactionThreshold = usableInputBudget;
  const defaultTargetPromptTokens = Math.floor(usableInputBudget * DEFAULT_TARGET_THRESHOLD_RATIO);

  const compactionThreshold = config?.compactionThreshold ?? defaultCompactionThreshold;
  const targetPromptTokens = config?.targetPromptTokens ?? defaultTargetPromptTokens;
  const summaryReserve = Math.min(12_000, Math.max(2_000, Math.floor(usableInputBudget * 0.08)));
  const recentMessagesBudget = Math.max(
    MIN_RECENT_BUDGET,
    targetPromptTokens - summaryReserve,
  );
  const defaultMinimumSavings = Math.max(2_000, Math.floor(usableInputBudget * MINIMUM_COMPACTION_SAVINGS_RATIO));
  const defaultRecompactCooldownTokens = Math.max(6_000, Math.floor(defaultMinimumSavings * 0.75));

  return {
    contextLimit,
    outputReserve,
    safetyBuffer,
    usableInputBudget,
    compactionThreshold,
    targetPromptTokens,
    recentMessagesBudget,
    summaryReserve,
    recompactCooldownMessages: config?.recompactCooldownMessages ?? DEFAULT_RECOMPACTION_COOLDOWN_MESSAGES,
    recompactCooldownTokens: defaultRecompactCooldownTokens,
    minimumSavingsTokens: config?.minimumSavingsTokens ?? defaultMinimumSavings,
    source: limitSource ?? "unknown",
  };
}

export function estimateToolSchemaTokens(tools: ToolSet): number {
  const serialized = Object.entries(tools).map(([name, tool]) => {
    const candidate = tool as Record<string, unknown>;
    return {
      name,
      description: typeof candidate.description === "string" ? candidate.description : undefined,
      inputSchema: candidate.inputSchema ?? candidate.parameters ?? undefined,
    };
  });
  return Math.ceil(safeStringify(serialized).length / 4);
}

export function estimateInstructionTokens(instructions: string): number {
  return Math.ceil(instructions.length / 4);
}

export function estimatePromptTokens(args: {
  messages: z.infer<typeof MessageList>;
  instructions: string;
  tools: ToolSet;
}): number {
  return estimateMessagesTokens(args.messages)
    + estimateInstructionTokens(args.instructions)
    + estimateToolSchemaTokens(args.tools);
}
