import { z } from 'zod';

export const SkillFrontmatter = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  author: z.string().optional(),
});

export const Skill = z.object({
  name: z.string(),
  path: z.string(),
  frontmatter: SkillFrontmatter,
  content: z.string(),
  supportingFiles: z
    .object({
      references: z.array(z.string()).optional(),
      templates: z.array(z.string()).optional(),
      scripts: z.array(z.string()).optional(),
      assets: z.array(z.string()).optional(),
    })
    .optional(),
});

export const SkillListItem = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  path: z.string(),
  source: z.enum(['builtin', 'workspace']),
});

export const SkillCandidate = z.object({
  signature: z.string(),
  status: z.enum(['pending', 'promoted', 'rejected']),
  confidence: z.number(),
  occurrences: z.number(),
  proposedSkillName: z.string().optional(),
  proposedCategory: z.string().optional(),
  proposedDescription: z.string().optional(),
  rationale: z.string().optional(),
  lastRunId: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  promotedSkillName: z.string().optional(),
});

export const SkillLearningStats = z.object({
  candidateCount: z.number(),
  pendingCandidateCount: z.number(),
  promotedCandidateCount: z.number(),
  rejectedCandidateCount: z.number(),
  trackedSkillCount: z.number(),
});

export const SkillRevision = z.object({
  id: z.string(),
  createdAt: z.string(),
  reason: z.string(),
  actor: z.enum(['system', 'agent', 'user']),
  runId: z.string().optional(),
  summary: z.string().optional(),
  previousContent: z.string().optional(),
  nextContent: z.string(),
});

export const ListSkillRevisionsResponse = z.object({
  revisions: z.array(SkillRevision),
  count: z.number(),
});

export const ListSkillsResponse = z.object({
  skills: z.array(SkillListItem),
  count: z.number(),
});

export const ListSkillCandidatesResponse = z.object({
  candidates: z.array(SkillCandidate),
  count: z.number(),
});

export const SkillConfig = z.object({
  maxNameLength: z.number().default(64),
  maxDescriptionLength: z.number().default(1024),
  maxContentChars: z.number().default(100000),
  maxFileBytes: z.number().default(1048576),
  allowedSubdirs: z
    .array(z.string())
    .default(['references', 'templates', 'scripts', 'assets']),
});
