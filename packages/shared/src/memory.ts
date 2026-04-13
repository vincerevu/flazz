import { z } from 'zod';

export const MemorySection = z.object({
  timestamp: z.string(),
  content: z.string(),
});

export const Memory = z.object({
  agent: z.array(MemorySection),
  user: z.array(MemorySection),
});

export const MemoryConfig = z.object({
  agentMaxChars: z.number().default(2200),
  userMaxChars: z.number().default(1375),
  delimiter: z.string().default('§'),
});
