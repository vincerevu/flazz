import { getModeLimit, downgradeMode } from "./retrieval-modes.js";
import type { IntegrationRetrievalMode } from "./types.js";

export class IntegrationRetrievalController {
  applyBudget<T extends { estimatedChars?: number; estimatedTokens?: number }>(
    items: T[],
    mode: IntegrationRetrievalMode,
    maxItems?: number
  ): { mode: IntegrationRetrievalMode; items: T[]; downgraded: boolean } {
    const limit = Math.min(maxItems ?? getModeLimit(mode), getModeLimit(mode));
    const selected = items.slice(0, limit);
    const oversized = selected.some((item) => (item.estimatedTokens ?? 0) > 6000);
    if (oversized && mode !== "compact") {
      return {
        mode: downgradeMode(mode),
        items: selected,
        downgraded: true,
      };
    }

    return {
      mode,
      items: selected,
      downgraded: false,
    };
  }
}
