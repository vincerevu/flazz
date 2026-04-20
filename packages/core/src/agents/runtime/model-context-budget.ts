import { ToolSet } from "ai";
import { MessageList } from "@flazz/shared";
import { z } from "zod";
import { estimateMessagesTokens } from "./context-compaction.js";
import type { LlmProvider } from "@flazz/shared";

const DEFAULT_CONTEXT_LIMIT = 128_000;
const DEFAULT_OUTPUT_RESERVE = 8_192;
const DEFAULT_SAFETY_BUFFER = 4_096;
const DEFAULT_COMPACTION_THRESHOLD_RATIO = 0.82;
const DEFAULT_TARGET_THRESHOLD_RATIO = 0.55;
const MIN_RECENT_BUDGET = 32_000;
const ABSOLUTE_MAX_COMPACTION_THRESHOLD = 150_000;
const DEFAULT_RECOMPACTION_COOLDOWN_MESSAGES = 4;
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
  minimumSavingsTokens: number;
  source: "registry" | "fallback";
};

/**
 * Optional per-agent overrides for context compaction thresholds.
 * All values are in tokens. Only the fields provided are applied;
 * the rest fall back to the model-derived defaults.
 */
export type CompactionConfig = {
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

type BudgetPreset = {
  contextLimit: number;
  outputReserve: number;
  safetyBuffer: number;
};

const PRESETS: Array<{ match: (provider: Provider, modelId: string) => boolean; budget: BudgetPreset }> = [
  {
    match: (_provider, modelId) => /claude/i.test(modelId),
    budget: { contextLimit: 200_000, outputReserve: 16_000, safetyBuffer: 8_000 },
  },
  {
    match: (_provider, modelId) => /gemini/i.test(modelId),
    budget: { contextLimit: 1_000_000, outputReserve: 32_000, safetyBuffer: 16_000 },
  },
  {
    match: (_provider, modelId) => /(gpt-5|gpt-4\.1|gpt-4o|o3|o4-mini)/i.test(modelId),
    budget: { contextLimit: 128_000, outputReserve: 16_000, safetyBuffer: 8_000 },
  },
  {
    match: (provider, modelId) => /minimax/i.test(modelId) || provider.flavor === "openai-compatible",
    budget: { contextLimit: 128_000, outputReserve: 8_192, safetyBuffer: 4_096 },
  },
  {
    match: (provider) => provider.flavor === "anthropic",
    budget: { contextLimit: 200_000, outputReserve: 16_000, safetyBuffer: 8_000 },
  },
  {
    match: (provider) => provider.flavor === "google" || provider.flavor === "google-vertex",
    budget: { contextLimit: 1_000_000, outputReserve: 32_000, safetyBuffer: 16_000 },
  },
];

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
): ModelContextBudget {
  const preset = PRESETS.find((item) => item.match(provider, modelId))?.budget;
  const budget = preset ?? {
    contextLimit: DEFAULT_CONTEXT_LIMIT,
    outputReserve: DEFAULT_OUTPUT_RESERVE,
    safetyBuffer: DEFAULT_SAFETY_BUFFER,
  };

  const usableInputBudget = Math.max(
    8_000,
    budget.contextLimit - budget.outputReserve - budget.safetyBuffer,
  );

  const defaultCompactionThreshold = Math.min(
    Math.floor(usableInputBudget * DEFAULT_COMPACTION_THRESHOLD_RATIO),
    ABSOLUTE_MAX_COMPACTION_THRESHOLD
  );
  const defaultTargetPromptTokens = Math.min(
    Math.floor(usableInputBudget * DEFAULT_TARGET_THRESHOLD_RATIO),
    Math.floor(ABSOLUTE_MAX_COMPACTION_THRESHOLD * (DEFAULT_TARGET_THRESHOLD_RATIO / DEFAULT_COMPACTION_THRESHOLD_RATIO))
  );

  const compactionThreshold = config?.compactionThreshold ?? defaultCompactionThreshold;
  const targetPromptTokens = config?.targetPromptTokens ?? defaultTargetPromptTokens;
  const summaryReserve = Math.min(12_000, Math.max(2_000, Math.floor(usableInputBudget * 0.08)));
  const recentMessagesBudget = Math.max(
    MIN_RECENT_BUDGET,
    targetPromptTokens - summaryReserve,
  );
  const defaultMinimumSavings = Math.max(2_000, Math.floor(usableInputBudget * MINIMUM_COMPACTION_SAVINGS_RATIO));

  return {
    contextLimit: budget.contextLimit,
    outputReserve: budget.outputReserve,
    safetyBuffer: budget.safetyBuffer,
    usableInputBudget,
    compactionThreshold,
    targetPromptTokens,
    recentMessagesBudget,
    summaryReserve,
    recompactCooldownMessages: config?.recompactCooldownMessages ?? DEFAULT_RECOMPACTION_COOLDOWN_MESSAGES,
    minimumSavingsTokens: config?.minimumSavingsTokens ?? defaultMinimumSavings,
    source: preset ? "registry" : "fallback",
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
