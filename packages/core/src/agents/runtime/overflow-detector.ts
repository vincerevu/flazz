import type { ModelContextBudget } from "./model-context-budget.js";

/**
 * Input for overflow detection.
 * Prefers actual token counts from API response over estimates.
 */
export interface OverflowCheckInput {
  /**
   * Actual input token count from API response (usage.promptTokens).
   * When present, this is used as the primary signal.
   */
  actualInputTokens?: number;
  /**
   * Estimated token count as fallback.
   * Used only when actualInputTokens is not available.
   */
  estimatedTokens?: number;
  /** Budget derived from the current model */
  budget: ModelContextBudget;
}

export interface OverflowCheckResult {
  /** Whether the context has exceeded the compaction threshold */
  isOverflow: boolean;
  /** Actual token count used for the check */
  usedTokens: number;
  /** Source of the token count */
  source: "actual" | "estimated" | "none";
  /** Tokens remaining before the compaction threshold */
  availableBuffer: number;
}

/**
 * Determines whether the current context has exceeded the compaction threshold.
 *
 * Priority order:
 * 1. `actualInputTokens` — from real API response usage (most accurate)
 * 2. `estimatedTokens`   — heuristic fallback (chars / 4)
 * 3. If neither, returns isOverflow: false (can't determine)
 *
 * This mirrors OpenCode's reactive overflow detection via `tokens.total`
 * rather than proactive pre-flight estimation.
 */
export function checkOverflow(input: OverflowCheckInput): OverflowCheckResult {
  if (input.actualInputTokens === undefined && input.estimatedTokens === undefined) {
    return {
      isOverflow: false,
      usedTokens: 0,
      source: "none",
      availableBuffer: input.budget.compactionThreshold,
    };
  }

  const usedTokens = input.actualInputTokens ?? input.estimatedTokens ?? 0;
  const source: OverflowCheckResult["source"] =
    input.actualInputTokens !== undefined ? "actual" : "estimated";
  const isOverflow = usedTokens >= input.budget.compactionThreshold;
  const availableBuffer = input.budget.compactionThreshold - usedTokens;

  return { isOverflow, usedTokens, source, availableBuffer };
}

/**
 * Returns true if auto-compaction is enabled for this budget.
 * Separate from checkOverflow so callers can gate the feature.
 */
export function isCompactionEnabled(budget: ModelContextBudget): boolean {
  return budget.compactionThreshold > 0;
}
