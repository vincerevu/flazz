import { z } from "zod";
import { RetrievedContextBundle } from "@flazz/shared";

export type RetrievedContextBundle = z.infer<typeof RetrievedContextBundle>;

export interface RetrievalOptions {
  includeMemory?: boolean;
  includeSkills?: boolean;
  includeMemorySearch?: boolean;
  includeRunMemory?: boolean;
  memorySearchLimit?: number;
  skillLimit?: number;
  runMemoryLimit?: number;
}

