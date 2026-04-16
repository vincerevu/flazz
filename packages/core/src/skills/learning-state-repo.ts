import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const LearningCandidate = z.object({
  signature: z.string(),
  status: z.enum(["pending", "promoted", "rejected"]).default("pending"),
  confidence: z.number().min(0).max(1).default(0.25),
  occurrences: z.number().int().nonnegative(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  lastRunId: z.string(),
  proposedSkillName: z.string().optional(),
  proposedCategory: z.string().optional(),
  proposedDescription: z.string().optional(),
  draftContent: z.string().optional(),
  rationale: z.string().optional(),
  promotedSkillName: z.string().optional(),
});

const LearnedSkillStats = z.object({
  usageCount: z.number().int().nonnegative().default(0),
  learnedFromRuns: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  lastUsedAt: z.string().optional(),
  lastLearnedAt: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
  lastFailureAt: z.string().optional(),
  source: z.enum(["workspace", "builtin", "unknown"]).default("unknown"),
});

const LearningState = z.object({
  candidates: z.record(z.string(), LearningCandidate),
  skills: z.record(z.string(), LearnedSkillStats),
});

type LearningState = z.infer<typeof LearningState>;
type Candidate = z.infer<typeof LearningCandidate>;

function computeCandidateConfidence(candidate: {
  occurrences: number;
  proposedSkillName?: string;
  draftContent?: string;
  proposedDescription?: string;
  rationale?: string;
  status?: "pending" | "promoted" | "rejected";
}): number {
  let score = 0.2;
  score += Math.min(candidate.occurrences, 3) * 0.2;
  if (candidate.draftContent) score += 0.2;
  if (candidate.proposedDescription) score += 0.1;
  if (candidate.rationale) score += 0.05;
  if (candidate.status === "promoted") score = 1;
  if (candidate.status === "rejected") score = Math.min(score, 0.2);
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

const DEFAULT_STATE: LearningState = {
  candidates: {},
  skills: {},
};

export class LearningStateRepo {
  private readonly stateFile: string;

  constructor(workDir: string) {
    this.stateFile = path.join(workDir, "data", "skills", "learning-state.json");
  }

  getCandidate(signature: string): Candidate | null {
    const state = this.load();
    return state.candidates[signature] ?? null;
  }

  bumpCandidate(signature: string, runId: string, proposedSkillName?: string): Candidate {
    const state = this.load();
    const now = new Date().toISOString();
    const existing = state.candidates[signature];

    const next: Candidate = existing
      ? {
          ...existing,
          confidence: computeCandidateConfidence({
            ...existing,
            occurrences: existing.occurrences + 1,
            proposedSkillName: proposedSkillName ?? existing.proposedSkillName,
          }),
          occurrences: existing.occurrences + 1,
          lastSeenAt: now,
          lastRunId: runId,
          status: existing.status === "rejected" ? "pending" : existing.status,
          proposedSkillName: proposedSkillName ?? existing.proposedSkillName,
        }
      : {
          signature,
          status: "pending",
          confidence: computeCandidateConfidence({ occurrences: 1 }),
          occurrences: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          lastRunId: runId,
          proposedSkillName,
        };

    state.candidates[signature] = next;
    this.save(state);
    return next;
  }

  markCandidatePromoted(signature: string, skillName: string): void {
    const state = this.load();
    const existing = state.candidates[signature];
    if (!existing) {
      return;
    }

    state.candidates[signature] = {
      ...existing,
      status: "promoted",
      confidence: 1,
      promotedSkillName: skillName,
      proposedSkillName: skillName,
      lastSeenAt: new Date().toISOString(),
    };
    this.save(state);
  }

  rejectCandidate(signature: string): void {
    const state = this.load();
    const existing = state.candidates[signature];
    if (!existing) {
      return;
    }

    state.candidates[signature] = {
      ...existing,
      status: "rejected",
      confidence: Math.min(existing.confidence, 0.2),
      lastSeenAt: new Date().toISOString(),
    };
    this.save(state);
  }

  updateCandidateDraft(
    signature: string,
    updates: {
      proposedSkillName?: string;
      proposedCategory?: string;
      proposedDescription?: string;
      draftContent?: string;
      rationale?: string;
    }
  ): Candidate | null {
    const state = this.load();
    const existing = state.candidates[signature];
    if (!existing) {
      return null;
    }

    const next: Candidate = {
      ...existing,
      status: existing.status === "promoted" ? "promoted" : "pending",
      proposedSkillName: updates.proposedSkillName ?? existing.proposedSkillName,
      proposedCategory: updates.proposedCategory ?? existing.proposedCategory,
      proposedDescription: updates.proposedDescription ?? existing.proposedDescription,
      draftContent: updates.draftContent ?? existing.draftContent,
      rationale: updates.rationale ?? existing.rationale,
      confidence: computeCandidateConfidence({
        ...existing,
        status: existing.status === "promoted" ? "promoted" : "pending",
        proposedDescription: updates.proposedDescription ?? existing.proposedDescription,
        draftContent: updates.draftContent ?? existing.draftContent,
        rationale: updates.rationale ?? existing.rationale,
      }),
      lastSeenAt: new Date().toISOString(),
    };

    state.candidates[signature] = next;
    this.save(state);
    return next;
  }

  listCandidates(): Candidate[] {
    const state = this.load();
    return Object.values(state.candidates).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  getState(): LearningState {
    return this.load();
  }

  recordSkillUsage(name: string, source: "workspace" | "builtin" | "unknown"): void {
    const state = this.load();
    const stats = state.skills[name] ?? {
      usageCount: 0,
      learnedFromRuns: 0,
      source,
    };

    state.skills[name] = {
      ...stats,
      source,
      usageCount: stats.usageCount + 1,
      lastUsedAt: new Date().toISOString(),
    };
    this.save(state);
  }

  recordSkillCreated(name: string, source: "workspace" | "builtin" | "unknown"): void {
    const state = this.load();
    const stats = state.skills[name] ?? {
      usageCount: 0,
      learnedFromRuns: 0,
      source,
    };

    state.skills[name] = {
      ...stats,
      source,
      learnedFromRuns: stats.learnedFromRuns + 1,
      lastLearnedAt: new Date().toISOString(),
    };
    this.save(state);
  }

  recordSkillFailure(name: string): void {
    const state = this.load();
    const stats = state.skills[name] ?? {
      usageCount: 0,
      learnedFromRuns: 0,
      failureCount: 0,
      source: "unknown" as const,
    };

    state.skills[name] = {
      ...stats,
      failureCount: stats.failureCount + 1,
      lastFailureAt: new Date().toISOString(),
    };
    this.save(state);
  }

  recordSkillUpdated(name: string): void {
    const state = this.load();
    const stats = state.skills[name] ?? {
      usageCount: 0,
      learnedFromRuns: 0,
      source: "unknown" as const,
    };

    state.skills[name] = {
      ...stats,
      lastUpdatedAt: new Date().toISOString(),
    };
    this.save(state);
  }

  private ensureDir(): void {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): LearningState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, "utf-8");
        return LearningState.parse(JSON.parse(raw));
      }
    } catch (error) {
      console.error("[SkillLearningState] Failed to load state:", error);
    }

    return DEFAULT_STATE;
  }

  private save(state: LearningState): void {
    this.ensureDir();
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}
