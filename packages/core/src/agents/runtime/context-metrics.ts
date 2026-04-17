import { RunEvent } from "@flazz/shared/dist/runs.js";
import { z } from "zod";

export type RunCompactionMetrics = {
  totalAttempts: number;
  completedCompactions: number;
  failedCompactions: number;
  escalatedCompactions: number;
  totalTokensSaved: number;
  averageReductionPercent: number;
};

export function deriveRunCompactionMetrics(log: Array<z.infer<typeof RunEvent>>): RunCompactionMetrics {
  let totalAttempts = 0;
  let completedCompactions = 0;
  let failedCompactions = 0;
  let escalatedCompactions = 0;
  let totalTokensSaved = 0;
  let totalReductionPercent = 0;

  for (const event of log) {
    if (event.type === "context-compaction-start") {
      totalAttempts += 1;
      if (event.escalated) escalatedCompactions += 1;
      continue;
    }

    if (event.type === "context-compaction-complete") {
      completedCompactions += 1;
      totalTokensSaved += event.tokensSaved;
      totalReductionPercent += event.reductionPercent;
      if (event.escalated) escalatedCompactions += 1;
      continue;
    }

    if (event.type === "context-compaction-failed") {
      failedCompactions += 1;
      if (event.escalated) escalatedCompactions += 1;
    }
  }

  return {
    totalAttempts,
    completedCompactions,
    failedCompactions,
    escalatedCompactions,
    totalTokensSaved,
    averageReductionPercent: completedCompactions > 0
      ? Math.round(totalReductionPercent / completedCompactions)
      : 0,
  };
}
