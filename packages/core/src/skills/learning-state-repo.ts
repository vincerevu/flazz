import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { WorkDir } from "../config/config.js";
import {
  createPrismaClient,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";

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

const LEGACY_STATE_RELATIVE_PATH = path.join("data", "skills", "learning-state.json");
const LEGACY_IMPORT_MARKER_KEY = "legacy_import:skill_learning_state";

export type LearningState = z.infer<typeof LearningState>;
export type Candidate = z.infer<typeof LearningCandidate>;
export type SkillRepairCandidate = z.infer<typeof SkillRepairCandidate>;

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

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

type CandidateRow = Awaited<
  ReturnType<FlazzPrismaClient["skillLearningCandidate"]["findUnique"]>
>;

function toCandidate(row: NonNullable<CandidateRow>): Candidate {
  return LearningCandidate.parse({
    signature: row.signature,
    status: row.status,
    confidence: row.confidence,
    occurrences: row.occurrences,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    lastRunId: row.lastRunId,
    proposedSkillName: row.proposedSkillName ?? undefined,
    proposedCategory: row.proposedCategory ?? undefined,
    proposedDescription: row.proposedDescription ?? undefined,
    draftContent: row.draftContent ?? undefined,
    rationale: row.rationale ?? undefined,
    promotedSkillName: row.promotedSkillName ?? undefined,
    relatedSkillName: row.relatedSkillName ?? undefined,
    recentRunIds: parseJsonArray(row.recentRunIdsJson),
    intentFingerprint: row.intentFingerprint ?? undefined,
    toolSequenceFingerprint: row.toolSequenceFingerprint ?? undefined,
    outputShape: row.outputShape ?? undefined,
    explicitUserReuseSignal: row.explicitUserReuseSignal,
    complexityScore: row.complexityScore,
    recurrenceScore: row.recurrenceScore,
  });
}

type StatsRow = Awaited<ReturnType<FlazzPrismaClient["skillLearningStats"]["findUnique"]>>;

function toStats(row: NonNullable<StatsRow>): z.infer<typeof LearnedSkillStats> {
  return LearnedSkillStats.parse({
    usageCount: row.usageCount,
    learnedFromRuns: row.learnedFromRuns,
    failureCount: row.failureCount,
    lastUsedAt: row.lastUsedAt ?? undefined,
    lastLearnedAt: row.lastLearnedAt ?? undefined,
    lastUpdatedAt: row.lastUpdatedAt ?? undefined,
    lastFailureAt: row.lastFailureAt ?? undefined,
    source: row.source,
  });
}

type RepairRow = Awaited<ReturnType<FlazzPrismaClient["skillRepairCandidate"]["findUnique"]>>;

function toRepair(row: NonNullable<RepairRow>): SkillRepairCandidate {
  return SkillRepairCandidate.parse({
    id: row.id,
    skillName: row.skillName,
    runId: row.runId,
    status: row.status,
    failureCategory: row.failureCategory,
    evidenceSummary: row.evidenceSummary,
    proposedPatch: row.proposedPatch ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class LearningStateRepo {
  private readonly prisma: FlazzPrismaClient;
  private readonly storage?: PrismaStorageOptions;
  private readonly ownsPrisma: boolean;
  private ready: Promise<void> | null = null;

  constructor(workDirOrOptions?: string | { prisma?: FlazzPrismaClient; storage?: PrismaStorageOptions }) {
    if (typeof workDirOrOptions === "string") {
      this.storage = { workDir: workDirOrOptions };
      this.ownsPrisma = true;
      this.prisma = createPrismaClient(this.storage);
      return;
    }

    this.storage = workDirOrOptions?.storage;
    this.ownsPrisma = !workDirOrOptions?.prisma;
    this.prisma = workDirOrOptions?.prisma ?? createPrismaClient(this.storage);
  }

  async dispose(): Promise<void> {
    if (this.ownsPrisma) {
      await this.prisma.$disconnect();
    }
  }

  async getCandidate(signature: string): Promise<Candidate | null> {
    await this.ensureReady();
    const row = await this.prisma.skillLearningCandidate.findUnique({ where: { signature } });
    return row ? toCandidate(row) : null;
  }

  async bumpCandidate(
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
  ): Promise<Candidate> {
    await this.ensureReady();
    const now = new Date().toISOString();
    const existing = await this.getCandidate(signature);
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

    await this.upsertCandidate(next);
    return next;
  }

  async markCandidatePromoted(signature: string, skillName: string): Promise<void> {
    await this.ensureReady();
    const existing = await this.getCandidate(signature);
    if (!existing) {
      return;
    }

    await this.upsertCandidate({
      ...existing,
      status: "promoted",
      confidence: 1,
      promotedSkillName: skillName,
      proposedSkillName: skillName,
      lastSeenAt: new Date().toISOString(),
    });
  }

  async rejectCandidate(signature: string): Promise<void> {
    await this.ensureReady();
    const existing = await this.getCandidate(signature);
    if (!existing) {
      return;
    }

    await this.upsertCandidate({
      ...existing,
      status: "rejected",
      confidence: Math.min(existing.confidence, 0.2),
      lastSeenAt: new Date().toISOString(),
    });
  }

  async updateCandidateDraft(
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
  ): Promise<Candidate | null> {
    await this.ensureReady();
    const existing = await this.getCandidate(signature);
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

    await this.upsertCandidate(next);
    return next;
  }

  async listCandidates(): Promise<Candidate[]> {
    await this.ensureReady();
    const rows = await this.prisma.skillLearningCandidate.findMany({
      orderBy: [
        { lastSeenAt: "desc" },
        { signature: "asc" },
      ],
    });
    return rows.map(toCandidate);
  }

  async findRelatedCandidates(filters: {
    signature?: string;
    intentFingerprint?: string;
    toolSequenceFingerprint?: string;
    relatedSkillName?: string;
  }): Promise<Candidate[]> {
    const candidates = await this.listCandidates();
    return candidates.filter((candidate) => {
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

  async getState(): Promise<LearningState> {
    await this.ensureReady();
    const [candidates, skills, repairs] = await Promise.all([
      this.prisma.skillLearningCandidate.findMany(),
      this.prisma.skillLearningStats.findMany(),
      this.prisma.skillRepairCandidate.findMany(),
    ]);

    return LearningState.parse({
      candidates: Object.fromEntries(candidates.map((row) => [row.signature, toCandidate(row)])),
      skills: Object.fromEntries(skills.map((row) => [row.name, toStats(row)])),
      repairs: Object.fromEntries(repairs.map((row) => [row.id, toRepair(row)])),
    });
  }

  async recordRepairCandidate(input: {
    skillName: string;
    runId: string;
    failureCategory: string;
    evidenceSummary: string;
    proposedPatch?: string;
  }): Promise<void> {
    await this.ensureReady();
    const id = `${input.skillName}:${input.runId}`;
    const now = new Date().toISOString();
    const existing = await this.prisma.skillRepairCandidate.findUnique({ where: { id } });

    await this.prisma.skillRepairCandidate.upsert({
      where: { id },
      create: {
        id,
        skillName: input.skillName,
        runId: input.runId,
        status: "pending",
        failureCategory: input.failureCategory,
        evidenceSummary: input.evidenceSummary,
        proposedPatch: input.proposedPatch ?? null,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        failureCategory: input.failureCategory,
        evidenceSummary: input.evidenceSummary,
        proposedPatch: input.proposedPatch ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
    });
  }

  async listRepairCandidates(): Promise<SkillRepairCandidate[]> {
    await this.ensureReady();
    const rows = await this.prisma.skillRepairCandidate.findMany({
      orderBy: [
        { updatedAt: "desc" },
        { id: "asc" },
      ],
    });
    return rows.map(toRepair);
  }

  async recordSkillUsage(name: string, source: "workspace" | "builtin" | "unknown"): Promise<void> {
    await this.updateSkillStats(name, source, (stats, now) => ({
      ...stats,
      source,
      usageCount: stats.usageCount + 1,
      lastUsedAt: now,
    }));
  }

  async recordSkillCreated(name: string, source: "workspace" | "builtin" | "unknown"): Promise<void> {
    await this.updateSkillStats(name, source, (stats, now) => ({
      ...stats,
      source,
      learnedFromRuns: stats.learnedFromRuns + 1,
      lastLearnedAt: now,
    }));
  }

  async recordSkillFailure(name: string): Promise<void> {
    await this.updateSkillStats(name, "unknown", (stats, now) => ({
      ...stats,
      failureCount: stats.failureCount + 1,
      lastFailureAt: now,
    }));
  }

  async recordSkillUpdated(name: string): Promise<void> {
    await this.updateSkillStats(name, "unknown", (stats, now) => ({
      ...stats,
      lastUpdatedAt: now,
    }));
  }

  private ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    return this.ready;
  }

  private async initialize(): Promise<void> {
    await applySqliteMigrations({ prisma: this.prisma, storage: this.storage });
    await this.importLegacyStateOnce();
  }

  private async upsertCandidate(candidate: Candidate): Promise<void> {
    await this.ensureReady();
    const data = {
      status: candidate.status,
      confidence: candidate.confidence,
      occurrences: candidate.occurrences,
      firstSeenAt: candidate.firstSeenAt,
      lastSeenAt: candidate.lastSeenAt,
      lastRunId: candidate.lastRunId,
      proposedSkillName: candidate.proposedSkillName ?? null,
      proposedCategory: candidate.proposedCategory ?? null,
      proposedDescription: candidate.proposedDescription ?? null,
      draftContent: candidate.draftContent ?? null,
      rationale: candidate.rationale ?? null,
      promotedSkillName: candidate.promotedSkillName ?? null,
      relatedSkillName: candidate.relatedSkillName ?? null,
      recentRunIdsJson: JSON.stringify(candidate.recentRunIds),
      intentFingerprint: candidate.intentFingerprint ?? null,
      toolSequenceFingerprint: candidate.toolSequenceFingerprint ?? null,
      outputShape: candidate.outputShape ?? null,
      explicitUserReuseSignal: candidate.explicitUserReuseSignal,
      complexityScore: candidate.complexityScore,
      recurrenceScore: candidate.recurrenceScore,
      updatedAt: new Date(),
    };

    await this.prisma.skillLearningCandidate.upsert({
      where: { signature: candidate.signature },
      create: {
        signature: candidate.signature,
        ...data,
      },
      update: data,
    });
  }

  private async updateSkillStats(
    name: string,
    source: "workspace" | "builtin" | "unknown",
    update: (
      stats: z.infer<typeof LearnedSkillStats>,
      now: string
    ) => z.infer<typeof LearnedSkillStats>
  ): Promise<void> {
    await this.ensureReady();
    const now = new Date().toISOString();
    const existing = await this.prisma.skillLearningStats.findUnique({ where: { name } });
    const current = existing
      ? toStats(existing)
      : LearnedSkillStats.parse({
          usageCount: 0,
          learnedFromRuns: 0,
          failureCount: 0,
          source,
        });
    const next = update(current, now);

    await this.prisma.skillLearningStats.upsert({
      where: { name },
      create: {
        name,
        usageCount: next.usageCount,
        learnedFromRuns: next.learnedFromRuns,
        failureCount: next.failureCount,
        lastUsedAt: next.lastUsedAt ?? null,
        lastLearnedAt: next.lastLearnedAt ?? null,
        lastUpdatedAt: next.lastUpdatedAt ?? null,
        lastFailureAt: next.lastFailureAt ?? null,
        source: next.source,
        updatedAt: new Date(),
      },
      update: {
        usageCount: next.usageCount,
        learnedFromRuns: next.learnedFromRuns,
        failureCount: next.failureCount,
        lastUsedAt: next.lastUsedAt ?? null,
        lastLearnedAt: next.lastLearnedAt ?? null,
        lastUpdatedAt: next.lastUpdatedAt ?? null,
        lastFailureAt: next.lastFailureAt ?? null,
        source: next.source,
        updatedAt: new Date(),
      },
    });
  }

  private async importLegacyStateOnce(): Promise<void> {
    const marker = await this.prisma.appKv.findUnique({ where: { key: LEGACY_IMPORT_MARKER_KEY } });
    if (marker) {
      return;
    }

    try {
      const legacyPath = this.legacyStatePath();
      if (!legacyPath) {
        return;
      }
      const raw = await fs.readFile(legacyPath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (raw) {
        const state = LearningState.parse(JSON.parse(raw));
        for (const candidate of Object.values(state.candidates)) {
          await this.upsertCandidateRow(candidate);
        }
        for (const [name, stats] of Object.entries(state.skills)) {
          await this.upsertStatsRow(name, stats);
        }
        for (const repair of Object.values(state.repairs)) {
          await this.upsertRepairRow(repair);
        }
      }
    } catch (error) {
      console.error("[LearningStateRepo] Failed to import legacy state:", error);
    } finally {
      await this.prisma.appKv.upsert({
        where: { key: LEGACY_IMPORT_MARKER_KEY },
        create: { key: LEGACY_IMPORT_MARKER_KEY, valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
        update: { valueJson: JSON.stringify({ importedAt: new Date().toISOString() }) },
      });
    }
  }

  private legacyStatePath(): string | null {
    if (this.storage?.databaseUrl && !this.storage.workDir) return null;
    return path.join(this.storage?.workDir ?? WorkDir, LEGACY_STATE_RELATIVE_PATH);
  }

  private async upsertCandidateRow(candidate: Candidate): Promise<void> {
    await this.prisma.skillLearningCandidate.upsert({
      where: { signature: candidate.signature },
      create: {
        signature: candidate.signature,
        status: candidate.status,
        confidence: candidate.confidence,
        occurrences: candidate.occurrences,
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt,
        lastRunId: candidate.lastRunId,
        proposedSkillName: candidate.proposedSkillName ?? null,
        proposedCategory: candidate.proposedCategory ?? null,
        proposedDescription: candidate.proposedDescription ?? null,
        draftContent: candidate.draftContent ?? null,
        rationale: candidate.rationale ?? null,
        promotedSkillName: candidate.promotedSkillName ?? null,
        relatedSkillName: candidate.relatedSkillName ?? null,
        recentRunIdsJson: JSON.stringify(candidate.recentRunIds),
        intentFingerprint: candidate.intentFingerprint ?? null,
        toolSequenceFingerprint: candidate.toolSequenceFingerprint ?? null,
        outputShape: candidate.outputShape ?? null,
        explicitUserReuseSignal: candidate.explicitUserReuseSignal,
        complexityScore: candidate.complexityScore,
        recurrenceScore: candidate.recurrenceScore,
        updatedAt: new Date(),
      },
      update: {
        status: candidate.status,
        confidence: candidate.confidence,
        occurrences: candidate.occurrences,
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt,
        lastRunId: candidate.lastRunId,
        proposedSkillName: candidate.proposedSkillName ?? null,
        proposedCategory: candidate.proposedCategory ?? null,
        proposedDescription: candidate.proposedDescription ?? null,
        draftContent: candidate.draftContent ?? null,
        rationale: candidate.rationale ?? null,
        promotedSkillName: candidate.promotedSkillName ?? null,
        relatedSkillName: candidate.relatedSkillName ?? null,
        recentRunIdsJson: JSON.stringify(candidate.recentRunIds),
        intentFingerprint: candidate.intentFingerprint ?? null,
        toolSequenceFingerprint: candidate.toolSequenceFingerprint ?? null,
        outputShape: candidate.outputShape ?? null,
        explicitUserReuseSignal: candidate.explicitUserReuseSignal,
        complexityScore: candidate.complexityScore,
        recurrenceScore: candidate.recurrenceScore,
        updatedAt: new Date(),
      },
    });
  }

  private async upsertStatsRow(
    name: string,
    stats: z.infer<typeof LearnedSkillStats>
  ): Promise<void> {
    await this.prisma.skillLearningStats.upsert({
      where: { name },
      create: {
        name,
        usageCount: stats.usageCount,
        learnedFromRuns: stats.learnedFromRuns,
        failureCount: stats.failureCount,
        lastUsedAt: stats.lastUsedAt ?? null,
        lastLearnedAt: stats.lastLearnedAt ?? null,
        lastUpdatedAt: stats.lastUpdatedAt ?? null,
        lastFailureAt: stats.lastFailureAt ?? null,
        source: stats.source,
        updatedAt: new Date(),
      },
      update: {
        usageCount: stats.usageCount,
        learnedFromRuns: stats.learnedFromRuns,
        failureCount: stats.failureCount,
        lastUsedAt: stats.lastUsedAt ?? null,
        lastLearnedAt: stats.lastLearnedAt ?? null,
        lastUpdatedAt: stats.lastUpdatedAt ?? null,
        lastFailureAt: stats.lastFailureAt ?? null,
        source: stats.source,
        updatedAt: new Date(),
      },
    });
  }

  private async upsertRepairRow(repair: SkillRepairCandidate): Promise<void> {
    await this.prisma.skillRepairCandidate.upsert({
      where: { id: repair.id },
      create: {
        id: repair.id,
        skillName: repair.skillName,
        runId: repair.runId,
        status: repair.status,
        failureCategory: repair.failureCategory,
        evidenceSummary: repair.evidenceSummary,
        proposedPatch: repair.proposedPatch ?? null,
        createdAt: repair.createdAt,
        updatedAt: repair.updatedAt,
      },
      update: {
        skillName: repair.skillName,
        runId: repair.runId,
        status: repair.status,
        failureCategory: repair.failureCategory,
        evidenceSummary: repair.evidenceSummary,
        proposedPatch: repair.proposedPatch ?? null,
        createdAt: repair.createdAt,
        updatedAt: repair.updatedAt,
      },
    });
  }
}
