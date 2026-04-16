import { z } from "zod";

export const RunOutcome = z.enum(["success", "failure", "stopped"]);

export const FailureCategory = z.enum([
  "missing-context",
  "wrong-tool",
  "wrong-sequence",
  "missing-validation",
  "missing-guardrail",
  "output-formatting",
  "permission-flow",
  "execution-error",
  "user-stopped",
  "unknown",
]);

export const RunMemoryRecord = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  taskType: z.string().optional(),
  summary: z.string(),
  firstUserMessage: z.string().optional(),
  entityRefs: z.array(z.string()).default([]),
  topicRefs: z.array(z.string()).default([]),
  projectRefs: z.array(z.string()).default([]),
  skillRefs: z.array(z.string()).default([]),
  toolRefs: z.array(z.string()).default([]),
  artifactRefs: z.array(z.string()).default([]),
  outcome: RunOutcome,
  failureCategory: FailureCategory.optional(),
  corrections: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const RunMemorySummary = RunMemoryRecord.pick({
  id: true,
  runId: true,
  agentId: true,
  summary: true,
  firstUserMessage: true,
  entityRefs: true,
  topicRefs: true,
  projectRefs: true,
  skillRefs: true,
  toolRefs: true,
  outcome: true,
  failureCategory: true,
  createdAt: true,
}).extend({
  score: z.number().optional(),
  preview: z.string().optional(),
});

export const ListRunMemoryResponse = z.object({
  records: z.array(RunMemorySummary),
  count: z.number(),
});

