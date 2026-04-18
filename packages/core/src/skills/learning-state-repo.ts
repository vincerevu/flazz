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
  relatedSkillName: z.string().optional(),
  recentRunIds: z.array(z.string()).default([]),
  intentFingerprint: z.string().optional(),
  toolSequenceFingerprint: z.string().optional(),
  outputShape: z.string().optional(),
  explicitUserReuseSignal: z.boolean().default(false),
  complexityScore: z.number().min(0).max(1).default(0),
  recurrenceScore: z.number().min(0).max(1).default(0),
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

const SkillRepairCandidate = z.object({
  id: z.string(),
  skillName: z.string(),
  runId: z.string(),
  status: z.enum(["pending", "applied", "rejected"]).default("pending"),
  failureCategory: z.string(),
  evidenceSummary: z.string(),
  proposedPatch: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const LearningState = z.object({
  candidates: z.record(z.string(), LearningCandidate),
  skills: z.record(z.string(), LearnedSkillStats),
  repairs: z.record(z.string(), SkillRepairCandidate).default({}),
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
  relatedSkillName?: string;
  explicitUserReuseSignal?: boolean;
  complexityScore?: number;
  recurrenceScore?: number;
}): number {
  let score = 0.1;
  score += Math.min(candidate.occurrences, 4) * 0.12;
  if (candidate.draftContent) score += 0.2;
  if (candidate.proposedDescription) score += 0.1;
  if (candidate.rationale) score += 0.05;
  if (candidate.relatedSkillName) score += 0.08;
  if (candidate.explicitUserReuseSignal) score += 0.12;
  score += Math.max(0, Math.min(1, candidate.complexityScore ?? 0)) * 0.16;
  score += Math.max(0, Math.min(1, candidate.recurrenceScore ?? 0)) * 0.17;
  if (candidate.status === "promoted") score = 1;
  if (candidate.status === "rejected") score = Math.min(score, 0.2);
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

const DEFAULT_STATE: LearningState = {
  candidates: {},
  skills: {},
  repairs: {},
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

  bumpCandidate(
    signature: string,
    runId: string,
    proposedSkillName?: string,
    metadata?: {
      relatedSkillName?: string;
      intentFingerprint?: string;
      toolSequenceFingerprint?: string;
      outputShape?: string;
      explicitUserReuseSignal?: boolean;
      complexityScore?: number;
      recurrenceScore?: number;
    }
  ): Candidate {
    const state = this.load();
    const now = new Date().toISOString();
    const existing = state.candidates[signature];
    const recentRunIds = existing
      ? Array.from(new Set([...existing.recentRunIds, runId])).slice(-5)
      : [runId];

    const next: Candidate = existing
      ? {
          ...existing,
          confidence: computeCandidateConfidence({
            ...existing,
            status: existing.status === "rejected" ? "pending" : existing.status,
            occurrences: existing.occurrences + 1,
            proposedSkillName: proposedSkillName ?? existing.proposedSkillName,
            relatedSkillName: metadata?.relatedSkillName ?? existing.relatedSkillName,
            explicitUserReuseSignal:
              metadata?.explicitUserReuseSignal ?? existing.explicitUserReuseSignal,
            complexityScore: metadata?.complexityScore ?? existing.complexityScore,
            recurrenceScore: metadata?.recurrenceScore ?? existing.recurrenceScore,
          }),
          occurrences: existing.occurrences + 1,
          lastSeenAt: now,
          lastRunId: runId,
          status: existing.status === "rejected" ? "pending" : existing.status,
          proposedSkillName: proposedSkillName ?? existing.proposedSkillName,
          relatedSkillName: metadata?.relatedSkillName ?? existing.relatedSkillName,
          recentRunIds,
          intentFingerprint: metadata?.intentFingerprint ?? existing.intentFingerprint,
          toolSequenceFingerprint:
            metadata?.toolSequenceFingerprint ?? existing.toolSequenceFingerprint,
          outputShape: metadata?.outputShape ?? existing.outputShape,
          explicitUserReuseSignal:
            metadata?.explicitUserReuseSignal ?? existing.explicitUserReuseSignal,
          complexityScore: metadata?.complexityScore ?? existing.complexityScore,
          recurrenceScore: metadata?.recurrenceScore ?? existing.recurrenceScore,
        }
      : {
          signature,
          status: "pending",
          confidence: computeCandidateConfidence({
            occurrences: 1,
            relatedSkillName: metadata?.relatedSkillName,
            explicitUserReuseSignal: metadata?.explicitUserReuseSignal,
            complexityScore: metadata?.complexityScore,
            recurrenceScore: metadata?.recurrenceScore,
          }),
          occurrences: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          lastRunId: runId,
          proposedSkillName,
          relatedSkillName: metadata?.relatedSkillName,
          recentRunIds,
          intentFingerprint: metadata?.intentFingerprint,
          toolSequenceFingerprint: metadata?.toolSequenceFingerprint,
          outputShape: metadata?.outputShape,
          explicitUserReuseSignal: metadata?.explicitUserReuseSignal ?? false,
          complexityScore: metadata?.complexityScore ?? 0,
          recurrenceScore: metadata?.recurrenceScore ?? 0,
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
      relatedSkillName?: string;
      explicitUserReuseSignal?: boolean;
      complexityScore?: number;
      recurrenceScore?: number;
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
      relatedSkillName: updates.relatedSkillName ?? existing.relatedSkillName,
      explicitUserReuseSignal:
        updates.explicitUserReuseSignal ?? existing.explicitUserReuseSignal,
      complexityScore: updates.complexityScore ?? existing.complexityScore,
      recurrenceScore: updates.recurrenceScore ?? existing.recurrenceScore,
      confidence: computeCandidateConfidence({
        ...existing,
        status: existing.status === "promoted" ? "promoted" : "pending",
        proposedDescription: updates.proposedDescription ?? existing.proposedDescription,
        draftContent: updates.draftContent ?? existing.draftContent,
        rationale: updates.rationale ?? existing.rationale,
        relatedSkillName: updates.relatedSkillName ?? existing.relatedSkillName,
        explicitUserReuseSignal:
          updates.explicitUserReuseSignal ?? existing.explicitUserReuseSignal,
        complexityScore: updates.complexityScore ?? existing.complexityScore,
        recurrenceScore: updates.recurrenceScore ?? existing.recurrenceScore,
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

  findRelatedCandidates(filters: {
    signature?: string;
    intentFingerprint?: string;
    toolSequenceFingerprint?: string;
    relatedSkillName?: string;
  }): Candidate[] {
    return Object.values(this.load().candidates).filter((candidate) => {
      if (filters.signature && candidate.signature === filters.signature) {
        return true;
      }

      const sameIntent =
        filters.intentFingerprint &&
        candidate.intentFingerprint === filters.intentFingerprint;
      const sameToolSequence =
        filters.toolSequenceFingerprint &&
        candidate.toolSequenceFingerprint === filters.toolSequenceFingerprint;
      const sameRelatedSkill =
        filters.relatedSkillName &&
        candidate.relatedSkillName === filters.relatedSkillName;

      return Boolean(
        (sameIntent && sameToolSequence) ||
          (sameIntent && sameRelatedSkill) ||
          (sameToolSequence && sameRelatedSkill)
      );
    });
  }

  getState(): LearningState {
    return this.load();
  }

  recordRepairCandidate(input: {
    skillName: string;
    runId: string;
    failureCategory: string;
    evidenceSummary: string;
    proposedPatch?: string;
  }): void {
    const state = this.load();
    const id = `${input.skillName}:${input.runId}`;
    const now = new Date().toISOString();
    state.repairs[id] = {
      id,
      skillName: input.skillName,
      runId: input.runId,
      status: "pending",
      failureCategory: input.failureCategory,
      evidenceSummary: input.evidenceSummary,
      proposedPatch: input.proposedPatch,
      createdAt: state.repairs[id]?.createdAt ?? now,
      updatedAt: now,
    };
    this.save(state);
  }

  listRepairCandidates(): Array<z.infer<typeof SkillRepairCandidate>> {
    return Object.values(this.load().repairs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
