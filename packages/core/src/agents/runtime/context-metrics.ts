import { RunEvent } from "@flazz/shared/dist/runs.js";
import { z } from "zod";

export type RunCompactionMetrics = {
  totalAttempts: number;
  completedCompactions: number;
  failedCompactions: number;
  escalatedCompactions: number;
  reusedCompactions: number;
  totalTokensSaved: number;
  averageReductionPercent: number;
  averageRecentMessagesKept: number;
  averageOperationalMessageCountAfter: number;
  failureBreakdown: Record<string, number>;
};

export function deriveRunCompactionMetrics(log: Array<z.infer<typeof RunEvent>>): RunCompactionMetrics {
  let totalAttempts = 0;
  let completedCompactions = 0;
  let failedCompactions = 0;
  let escalatedCompactions = 0;
  let reusedCompactions = 0;
  let totalTokensSaved = 0;
  let totalReductionPercent = 0;
  let totalRecentMessagesKept = 0;
  let totalOperationalMessageCountAfter = 0;
  const failureBreakdown: Record<string, number> = {};

  for (const event of log) {
    if (event.type === "context-compaction-start") {
      totalAttempts += 1;
      if (event.escalated) escalatedCompactions += 1;
      continue;
    }

    if (event.type === "context-compaction-complete") {
      const compactionEvent = event as typeof event & {
        operationalMessageCountAfter?: number;
      };
      completedCompactions += 1;
      totalTokensSaved += event.tokensSaved;
      totalReductionPercent += event.reductionPercent;
      totalRecentMessagesKept += event.recentMessages;
      totalOperationalMessageCountAfter += compactionEvent.operationalMessageCountAfter ?? event.messageCountAfter;
      if (event.reused) reusedCompactions += 1;
      if (event.escalated) escalatedCompactions += 1;
      continue;
    }

    if (event.type === "context-compaction-failed") {
      const failedEvent = event as typeof event & {
        failureCategory?: string;
      };
      failedCompactions += 1;
      const failureCategory = failedEvent.failureCategory ?? "other";
      failureBreakdown[failureCategory] = (failureBreakdown[failureCategory] ?? 0) + 1;
      if (event.escalated) escalatedCompactions += 1;
    }
  }

  return {
    totalAttempts,
    completedCompactions,
    failedCompactions,
    escalatedCompactions,
    reusedCompactions,
    totalTokensSaved,
    averageReductionPercent: completedCompactions > 0
      ? Math.round(totalReductionPercent / completedCompactions)
      : 0,
    averageRecentMessagesKept: completedCompactions > 0
      ? Math.round(totalRecentMessagesKept / completedCompactions)
      : 0,
    averageOperationalMessageCountAfter: completedCompactions > 0
      ? Math.round(totalOperationalMessageCountAfter / completedCompactions)
      : 0,
    failureBreakdown,
  };
}
