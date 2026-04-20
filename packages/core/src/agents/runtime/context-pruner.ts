import { MessageList } from "@flazz/shared";
import { z } from "zod";
import { estimateMessageTokens } from "./context-compaction.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Minimum tokens that must be saved for a prune pass to be worthwhile.
 * Mirrors OpenCode's `PRUNE_MINIMUM = 20_000`.
 */
export const PRUNE_MIN_SAVINGS = 20_000;

/**
 * Recent tool results up to this many tokens are protected and never pruned.
 * Mirrors OpenCode's `PRUNE_PROTECT = 40_000`.
 */
export const PRUNE_PROTECT_BUDGET = 40_000;

/**
 * Tools whose results must never be pruned — their outputs are referenced
 * by the agent's ongoing reasoning or are too expensive to re-fetch.
 */
const PRUNE_PROTECTED_TOOLS = new Set([
  "skill",
  "workspace-readfile",
  "read_knowledge",
  "list_workspace",
]);

/**
 * Content length (chars) left in a pruned tool result.
 * Enough to identify the call, not enough to bloat context.
 */
const PRUNED_RESULT_CHARS = 200;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PruneResult {
  /** Message list after pruning (same reference if nothing changed) */
  messages: z.infer<typeof MessageList>;
  /** Number of tool result messages that were trimmed */
  prunedCount: number;
  /** Estimated tokens saved */
  tokensSaved: number;
}

// ─── Implementation ────────────────────────────────────────────────────────────

/**
 * Trim output of old tool calls to reclaim context space without full compaction.
 *
 * Algorithm (mirrors OpenCode `prune()`):
 * 1. Walk messages from end to start, accumulating tool-result tokens.
 * 2. Once we've accumulated PRUNE_PROTECT_BUDGET tokens → everything before
 *    that boundary is a candidate for pruning.
 * 3. Skip protected tools and already-tiny results.
 * 4. Only apply if total savings ≥ PRUNE_MIN_SAVINGS.
 *
 * This is a pure function — does not mutate the input array.
 */
export function pruneToolOutputs(
  messages: z.infer<typeof MessageList>,
): PruneResult {
  // Collect candidate indices (tool messages outside the protected window)
  const candidateIndices: number[] = [];
  let protectedAccumulated = 0;
  let withinProtectedWindow = true;

  // Walk from the end — newest messages first
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "tool") continue;
    if (PRUNE_PROTECTED_TOOLS.has(msg.toolName)) continue;

    const tokens = estimateMessageTokens(msg);

    if (withinProtectedWindow) {
      protectedAccumulated += tokens;
      if (protectedAccumulated >= PRUNE_PROTECT_BUDGET) {
        withinProtectedWindow = false;
      }
      continue;
    }

    // Outside the protected window — candidate
    candidateIndices.push(i);
  }

  if (candidateIndices.length === 0) {
    return { messages, prunedCount: 0, tokensSaved: 0 };
  }

  // Estimate savings
  let wouldSave = 0;
  for (const idx of candidateIndices) {
    const msg = messages[idx];
    if (msg.role !== "tool") continue;
    const currentTokens = estimateMessageTokens(msg);
    const afterTokens = Math.ceil(PRUNED_RESULT_CHARS / 4);
    wouldSave += Math.max(0, currentTokens - afterTokens);
  }

  // Only prune if meaningful savings
  if (wouldSave < PRUNE_MIN_SAVINGS) {
    return { messages, prunedCount: 0, tokensSaved: 0 };
  }

  // Apply prune
  const toPrune = new Set(candidateIndices);
  let prunedCount = 0;

  const pruned = messages.map((msg, i) => {
    if (!toPrune.has(i) || msg.role !== "tool") return msg;
    if (msg.content.length <= PRUNED_RESULT_CHARS) return msg; // already short

    prunedCount++;
    const trimmed = msg.content.slice(0, PRUNED_RESULT_CHARS);
    return {
      ...msg,
      content: `${trimmed}\n...[pruned for context budget]`,
    };
  });

  return { messages: pruned, prunedCount, tokensSaved: wouldSave };
}
