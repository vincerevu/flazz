import { z } from "zod";
import { FailureCategory, RunOutcome } from "./run-memory.js";

export const RetrievalSource = z.enum(["hot-memory", "memory-note", "skill", "run-memory"]);

export const RetrievalMode = z.enum(["compact", "summary", "detailed_structured", "slices", "full"]);

export const RetrievalScoreBreakdown = z.object({
  keyword: z.number().default(0),
  recency: z.number().default(0),
  graph: z.number().default(0),
  usage: z.number().default(0),
  failurePenalty: z.number().default(0),
  total: z.number().default(0),
});

export const RetrievedMemoryNote = z.object({
  source: z.literal("memory-note"),
  title: z.string(),
  path: z.string(),
  preview: z.string(),
  score: z.number(),
  scoreBreakdown: RetrievalScoreBreakdown.optional(),
});

export const RetrievedSkill = z.object({
  source: z.literal("skill"),
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  path: z.string(),
  skillSource: z.enum(["builtin", "workspace"]),
  content: z.string(),
  score: z.number(),
  scoreBreakdown: RetrievalScoreBreakdown.optional(),
});

export const RetrievedRunMemory = z.object({
  source: z.literal("run-memory"),
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  summary: z.string(),
  preview: z.string().optional(),
  firstUserMessage: z.string().optional(),
  entityRefs: z.array(z.string()).default([]),
  topicRefs: z.array(z.string()).default([]),
  projectRefs: z.array(z.string()).default([]),
  skillRefs: z.array(z.string()).default([]),
  toolRefs: z.array(z.string()).default([]),
  outcome: RunOutcome,
  failureCategory: FailureCategory.optional(),
  createdAt: z.string(),
  score: z.number(),
  scoreBreakdown: RetrievalScoreBreakdown.optional(),
});

export const RetrievedContextBundle = z.object({
  query: z.string(),
  hotMemoryContext: z.string().optional(),
  memoryNotes: z.array(RetrievedMemoryNote).default([]),
  skills: z.array(RetrievedSkill).default([]),
  runMemories: z.array(RetrievedRunMemory).default([]),
});

