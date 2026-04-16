import { generateText } from "ai";
import crypto from "node:crypto";
import { Run } from "@flazz/shared";
import z from "zod";
import { IModelConfigRepo } from "../models/repo.js";
import { createProvider } from "../models/models.js";
import { SkillRegistry } from "./registry.js";
import { SkillManager } from "./skill-manager.js";
import { LearningStateRepo } from "./learning-state-repo.js";
import { classifyRunFailure } from "./failure-classifier.js";
import { buildRepairEvidence } from "./repair-evidence.js";

const PROMOTION_THRESHOLD = 2;

const LearningDecision = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("none"),
    rationale: z.string().optional(),
  }),
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(64),
    category: z.string().min(1).max(64).optional(),
    description: z.string().min(1).max(1024),
    content: z.string().min(1),
    rationale: z.string().optional(),
  }),
  z.object({
    action: z.literal("update"),
    targetSkill: z.string().min(1),
    content: z.string().min(1),
    rationale: z.string().optional(),
  }),
]);

type LearningDecision = z.infer<typeof LearningDecision>;
type RunRecord = z.infer<typeof Run>;

type LoadedSkill = {
  name: string;
  source: "workspace" | "builtin" | "unknown";
};

const SKIPPED_AGENT_NAMES = new Set([
  "note_creation",
  "email-draft",
  "meeting-prep",
]);

function slugifySkillName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function getFirstUserMessage(run: RunRecord): string {
  for (const event of run.log) {
    if (event.type === "message" && event.message.role === "user") {
      return extractText(event.message.content).trim();
    }
  }

  return "";
}

function getToolNames(run: RunRecord): string[] {
  return run.log
    .filter((event) => event.type === "tool-invocation")
    .map((event) => event.toolName);
}

function buildTranscript(run: RunRecord): string {
  const lines: string[] = [];

  for (const event of run.log) {
    if (event.type === "message") {
      const text = extractText(event.message.content).trim();
      if (!text) {
        continue;
      }

      lines.push(`${event.message.role.toUpperCase()}: ${text.slice(0, 1200)}`);
      continue;
    }

    if (event.type === "tool-invocation") {
      lines.push(`TOOL: ${event.toolName}`);
    }
  }

  return lines.join("\n\n").slice(0, 12000);
}

export function getLoadedSkills(run: RunRecord): LoadedSkill[] {
  const loadedSkills = new Map<string, LoadedSkill>();

  for (const event of run.log) {
    if (event.type !== "tool-result" || event.toolName !== "loadSkill") {
      continue;
    }

    const result = event.result;
    if (!result || typeof result !== "object") {
      continue;
    }

    const success = "success" in result ? result.success : false;
    const skillName = "skillName" in result ? result.skillName : undefined;
    const source = "source" in result ? result.source : "unknown";

    if (
      success === true &&
      typeof skillName === "string" &&
      (source === "workspace" || source === "builtin" || source === "unknown")
    ) {
      loadedSkills.set(skillName, {
        name: skillName,
        source,
      });
    }
  }

  return Array.from(loadedSkills.values());
}

function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 10);
}

export function buildRunSignature(run: RunRecord): string {
  const queryWords = normalizeWords(getFirstUserMessage(run)).join("-");
  const toolNames = Array.from(new Set(getToolNames(run))).sort().join("-");
  const raw = `${run.agentId}|${queryWords}|${toolNames}`;
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function hasResolvedHumanOrPermissionFlow(run: RunRecord): boolean {
  const permissionRequests = run.log.filter((event) => event.type === "tool-permission-request").length;
  const permissionResponses = run.log.filter((event) => event.type === "tool-permission-response").length;
  const askRequests = run.log.filter((event) => event.type === "ask-human-request").length;
  const askResponses = run.log.filter((event) => event.type === "ask-human-response").length;

  return permissionRequests === permissionResponses && askRequests === askResponses;
}

export function shouldConsiderRun(run: RunRecord): { ok: boolean; reason?: string } {
  if (SKIPPED_AGENT_NAMES.has(run.agentId)) {
    return { ok: false, reason: "skipped system agent" };
  }

  if (run.log.some((event) => event.type === "error" || event.type === "run-stopped")) {
    return { ok: false, reason: "run ended with error or stop" };
  }

  if (!hasResolvedHumanOrPermissionFlow(run)) {
    return { ok: false, reason: "run still has unresolved human or permission flow" };
  }

  const toolNames = getToolNames(run);
  if (toolNames.includes("skill_manage")) {
    return { ok: false, reason: "run already used explicit skill management" };
  }

  const userMessages = run.log.filter(
    (event) => event.type === "message" && event.message.role === "user"
  );
  const assistantMessages = run.log.filter(
    (event) => event.type === "message" && event.message.role === "assistant"
  );

  if (!userMessages.length || !assistantMessages.length) {
    return { ok: false, reason: "run does not contain a complete conversation" };
  }

  if (toolNames.length < 5) {
    return { ok: false, reason: "run was not complex enough" };
  }

  return { ok: true };
}

export function runHasFailureSignal(run: RunRecord): boolean {
  return run.log.some((event) => event.type === "error" || event.type === "run-stopped");
}

function buildPrompt(run: RunRecord, loadedSkills: LoadedSkill[], promoteNow: boolean): string {
  const toolNames = getToolNames(run);
  const transcript = buildTranscript(run);
  const loadedSkillLines = loadedSkills.length
    ? loadedSkills.map((skill) => `- ${skill.name} (${skill.source})`).join("\n")
    : "- none";

  return [
    "You are the Flazz skill-learning controller.",
    "Decide whether this successful run should create a new reusable skill, update an existing workspace skill, or do nothing.",
    "Prefer update when the run used a workspace skill and the final successful procedure clearly improves it.",
    "If a workspace skill was loaded and recently failed, strongly prefer action=update when this run appears to repair or clarify the procedure.",
    "Prefer create only for reusable, non-trivial workflows that would likely recur.",
    "Do not create skills for one-off answers, pure writing tasks, or simple lookups.",
    `A new skill may only be promoted now if promoteNow=${promoteNow}. If promoteNow is false, do not return action=create unless the user explicitly asked to remember/save the procedure.`,
    "Return strict JSON only.",
    "Schema:",
    '{ "action": "none", "rationale"?: string }',
    '{ "action": "create", "name": string, "category"?: string, "description": string, "content": string, "rationale"?: string }',
    '{ "action": "update", "targetSkill": string, "content": string, "rationale"?: string }',
    "For create/update, content must be a full SKILL.md with YAML frontmatter then markdown body.",
    "Use frontmatter keys: name, description, category, tags, version, author.",
    "Body sections should include When to Use, Steps, Pitfalls, Verification.",
    "",
    `Agent: ${run.agentId}`,
    `First user request: ${getFirstUserMessage(run) || "(none)"}`,
    `Tool calls (${toolNames.length}): ${toolNames.join(", ")}`,
    "Loaded skills:",
    loadedSkillLines,
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

export class RunLearningService {
  private processedRunIds = new Set<string>();

  constructor(
    private skillManager: SkillManager,
    private skillRegistry: SkillRegistry,
    private stateRepo: LearningStateRepo,
    private modelConfigRepo: IModelConfigRepo
  ) {}

  async learnFromRun(run: RunRecord): Promise<void> {
    if (this.processedRunIds.has(run.id)) {
      return;
    }

    const loadedSkills = getLoadedSkills(run);
    for (const skill of loadedSkills) {
      this.stateRepo.recordSkillUsage(skill.name, skill.source);
    }

    if (runHasFailureSignal(run)) {
      for (const skill of loadedSkills) {
        if (skill.source === "workspace") {
          this.stateRepo.recordSkillFailure(skill.name);
          const failure = classifyRunFailure(run);
          const evidence = buildRepairEvidence(run, skill.name, failure);
          this.stateRepo.recordRepairCandidate({
            skillName: skill.name,
            runId: run.id,
            failureCategory: failure.category,
            evidenceSummary: evidence.evidenceSummary,
            proposedPatch: evidence.proposedPatch,
          });
        }
      }
      console.log(`[SkillLearning] Recorded failure signals for run ${run.id}.`);
      return;
    }

    const eligibility = shouldConsiderRun(run);
    if (!eligibility.ok) {
      console.log(`[SkillLearning] Skipping run ${run.id}: ${eligibility.reason}`);
      return;
    }

    this.processedRunIds.add(run.id);

    const signature = buildRunSignature(run);
    const priorCandidate = this.stateRepo.getCandidate(signature);
    const promoteNow = !!priorCandidate && priorCandidate.occurrences + 1 >= PROMOTION_THRESHOLD;

    try {
      const modelConfig = await this.modelConfigRepo.getConfig();
      if (!modelConfig) {
        return;
      }

      const provider = createProvider(modelConfig.provider);
      const model = provider.languageModel(modelConfig.model);
      const response = await generateText({
        model,
        prompt: buildPrompt(run, loadedSkills, promoteNow),
      });

      const parsed = LearningDecision.safeParse(
        JSON.parse(stripCodeFence(response.text))
      );

      if (!parsed.success) {
        console.warn(`[SkillLearning] Invalid learning output for run ${run.id}`);
        return;
      }

      await this.persistDecision(run, signature, parsed.data);
    } catch (error) {
      console.error(`[SkillLearning] Failed for run ${run.id}:`, error);
    }
  }

  listCandidates(): Array<{
    signature: string;
    status: "pending" | "promoted" | "rejected";
    confidence: number;
    occurrences: number;
    proposedSkillName?: string;
    proposedCategory?: string;
    proposedDescription?: string;
    rationale?: string;
    lastRunId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    promotedSkillName?: string;
  }> {
    return this.stateRepo.listCandidates();
  }

  async promoteCandidate(signature: string): Promise<{ success: boolean; error?: string; skillName?: string }> {
    const candidate = this.stateRepo.getCandidate(signature);
    if (!candidate) {
      return { success: false, error: `Candidate '${signature}' not found.` };
    }

    if (!candidate.draftContent || !candidate.proposedSkillName) {
      return { success: false, error: `Candidate '${signature}' does not have a draft skill yet.` };
    }

    if (candidate.promotedSkillName) {
      return { success: true, skillName: candidate.promotedSkillName };
    }

    const existing = await this.skillManager.get(candidate.proposedSkillName);
    if (existing) {
      this.stateRepo.markCandidatePromoted(signature, existing.name);
      return { success: true, skillName: existing.name };
    }

    const result = await this.skillManager.create(
      candidate.proposedSkillName,
      candidate.draftContent,
      candidate.proposedCategory
    );
    if (!result.success) {
      return { success: false, error: result.error || "Failed to promote candidate." };
    }

    this.stateRepo.markCandidatePromoted(signature, candidate.proposedSkillName);
    this.stateRepo.recordSkillCreated(candidate.proposedSkillName, "workspace");
    return { success: true, skillName: candidate.proposedSkillName };
  }

  rejectCandidate(signature: string): { success: boolean; error?: string } {
    const candidate = this.stateRepo.getCandidate(signature);
    if (!candidate) {
      return { success: false, error: `Candidate '${signature}' not found.` };
    }

    this.stateRepo.rejectCandidate(signature);
    return { success: true };
  }

  listRepairCandidates() {
    return this.stateRepo.listRepairCandidates();
  }

  getLearningStats(): {
    candidateCount: number;
    pendingCandidateCount: number;
    promotedCandidateCount: number;
    rejectedCandidateCount: number;
    trackedSkillCount: number;
    repairCandidateCount: number;
  } {
    const state = this.stateRepo.getState();
    const candidates = Object.values(state.candidates);
    return {
      candidateCount: candidates.length,
      pendingCandidateCount: candidates.filter((candidate) => candidate.status === "pending").length,
      promotedCandidateCount: candidates.filter((candidate) => candidate.status === "promoted").length,
      rejectedCandidateCount: candidates.filter((candidate) => candidate.status === "rejected").length,
      trackedSkillCount: Object.keys(state.skills).length,
      repairCandidateCount: Object.keys(state.repairs).length,
    };
  }

  private async persistDecision(
    run: RunRecord,
    signature: string,
    decision: LearningDecision
  ): Promise<void> {
    if (decision.action === "none") {
      console.log(`[SkillLearning] No action for run ${run.id}: ${decision.rationale || "model declined"}`);
      return;
    }

    if (decision.action === "update") {
      await this.updateExistingSkill(run, decision);
      return;
    }

    await this.createOrPromoteSkill(run, signature, decision);
  }

  private async updateExistingSkill(
    run: RunRecord,
    decision: Extract<LearningDecision, { action: "update" }>
  ): Promise<void> {
    const existing = await this.skillRegistry.get(decision.targetSkill);
    if (!existing || existing.source !== "workspace") {
      console.log(`[SkillLearning] Cannot update '${decision.targetSkill}' from run ${run.id}: not a workspace skill.`);
      return;
    }

    const result = await this.skillManager.update(existing.name, decision.content);
    if (!result.success) {
      console.warn(`[SkillLearning] Failed to update '${existing.name}' from run ${run.id}: ${result.error}`);
      return;
    }

    this.stateRepo.recordSkillUpdated(existing.name);
    console.log(
      `[SkillLearning] Updated skill '${existing.name}' from run ${run.id}${decision.rationale ? ` (${decision.rationale})` : ""}`
    );
  }

  private async createOrPromoteSkill(
    run: RunRecord,
    signature: string,
    decision: Extract<LearningDecision, { action: "create" }>
  ): Promise<void> {
    const name = slugifySkillName(decision.name);
    if (!name) {
      return;
    }

    const existing = await this.skillManager.get(name);
    if (existing) {
      console.log(`[SkillLearning] Skill '${name}' already exists, skipping auto-create.`);
      return;
    }

    const candidate = this.stateRepo.bumpCandidate(signature, run.id, name);
    this.stateRepo.updateCandidateDraft(signature, {
      proposedSkillName: name,
      proposedCategory: decision.category,
      proposedDescription: decision.description,
      draftContent: decision.content,
      rationale: decision.rationale,
    });
    const userExplicitlyAskedToRemember = /\b(remember|save (?:this|it) as a skill|learn this workflow)\b/i.test(
      getFirstUserMessage(run)
    );

    if (!userExplicitlyAskedToRemember && candidate.occurrences < PROMOTION_THRESHOLD) {
      console.log(
        `[SkillLearning] Stored candidate '${name}' from run ${run.id}; waiting for recurrence (${candidate.occurrences}/${PROMOTION_THRESHOLD}).`
      );
      return;
    }

    const result = await this.skillManager.create(name, decision.content, decision.category);
    if (!result.success) {
      console.warn(`[SkillLearning] Failed to create '${name}' from run ${run.id}: ${result.error}`);
      return;
    }

    this.stateRepo.markCandidatePromoted(signature, name);
    this.stateRepo.recordSkillCreated(name, "workspace");
    console.log(
      `[SkillLearning] Created skill '${name}' from run ${run.id}${decision.rationale ? ` (${decision.rationale})` : ""}`
    );
  }
}
