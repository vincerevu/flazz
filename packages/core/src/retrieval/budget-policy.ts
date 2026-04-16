import type { RetrievalOptions } from "./types.js";

export function resolveRetrievalLimits(options?: RetrievalOptions) {
  return {
    memorySearchLimit: options?.memorySearchLimit ?? 5,
    skillLimit: options?.skillLimit ?? 3,
    runMemoryLimit: options?.runMemoryLimit ?? 3,
  };
}

