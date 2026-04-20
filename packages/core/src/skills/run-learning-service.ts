import { streamText } from "ai";
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

const CANDIDATE_SCORE_THRESHOLD = 0.38;
const PROMOTION_SCORE_THRESHOLD = 0.78;
const PROMOTION_OCCURRENCE_THRESHOLD = 2;

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

type RunLearningSignals = {
  firstUserMessage: string;
  toolNames: string[];
  uniqueToolNames: string[];
  orderedToolNames: string[];
  intentFingerprint: string;
  toolSequenceFingerprint: string;
  outputShape: string;
  explicitUserReuseSignal: boolean;
  complexityScore: number;
  transcript: string;
};

type RelatedSkillMatch = {
  name: string;
  score: number;
  description?: string;
  tags?: string[];
  content?: string;
};

const SKIPPED_AGENT_NAMES = new Set([
  "note_creation",
  "labeling_agent",
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

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function extractJsonPayload(text: string): string {
  const cleaned = stripCodeFence(stripThinkingBlocks(text));
  const firstBrace = cleaned.indexOf("{");

  if (firstBrace === -1) {
    return cleaned;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(firstBrace, index + 1);
      }
    }
  }

  return cleaned;
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

function getOrderedUniqueToolNames(run: RunRecord): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const toolName of getToolNames(run)) {
    if (!seen.has(toolName)) {
      seen.add(toolName);
      ordered.push(toolName);
    }
  }
  return ordered;
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

export function parseLearningDecisionPayload(text: string): unknown {
  const extracted = extractJsonPayload(text);
  try {
    return JSON.parse(extracted);
  } catch {
    // LLM returned prose / markdown instead of JSON — log and return null.
    // The caller uses LearningDecision.safeParse() so null → graceful skip.
    console.warn(
      `[SkillLearning] parseLearningDecisionPayload: response was not valid JSON. ` +
      `Preview: ${text.slice(0, 200).replace(/\n/g, " ")}`
    );
    return null;
  }
}

function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 10);
}

function detectOutputShape(run: RunRecord): string {
  const lastAssistant = [...run.log].reverse().find((event) => {
    if (event.type !== "message") {
      return false;
    }
    return event.message.role === "assistant";
  });
  const text =
    lastAssistant && lastAssistant.type === "message"
      ? extractText(lastAssistant.message.content).trim()
      : "";

  if (!text) {
    return "none";
  }

  if (text.includes("```")) {
    return "code";
  }
  if (/^\s*[-*]\s+/m.test(text) || /^\s*\d+\.\s+/m.test(text)) {
    return "checklist";
  }
  if (/^#{1,4}\s+/m.test(text)) {
    return "sectioned";
  }
  if (text.includes("{") && text.includes("}")) {
    return "structured";
  }

  return "narrative";
}

function hasExplicitReuseSignal(input: string): boolean {
  return /\b(remember|save (?:this|it) as a skill|learn this workflow|for next time|reuse this|make this reusable)\b/i.test(
    input
  );
}

export function deriveRunLearningSignals(run: RunRecord): RunLearningSignals {
  const firstUserMessage = getFirstUserMessage(run);
  const toolNames = getToolNames(run);
  const uniqueToolNames = Array.from(new Set(toolNames));
  const orderedToolNames = getOrderedUniqueToolNames(run);
  const intentFingerprint = normalizeWords(firstUserMessage).join("-");
  const toolSequenceFingerprint = orderedToolNames.join("-");
  const outputShape = detectOutputShape(run);
  const transcript = buildTranscript(run);
  const userMessageCount = run.log.filter(
    (event) => event.type === "message" && event.message.role === "user"
  ).length;
  const assistantMessageCount = run.log.filter(
    (event) => event.type === "message" && event.message.role === "assistant"
  ).length;
  const explicitUserReuseSignal = hasExplicitReuseSignal(firstUserMessage);

  let complexityScore = 0.15;
  complexityScore += Math.min(uniqueToolNames.length, 6) * 0.08;
  complexityScore += Math.min(toolNames.length, 10) * 0.03;
  complexityScore += Math.min(userMessageCount + assistantMessageCount, 6) * 0.03;
  if (explicitUserReuseSignal) {
    complexityScore += 0.12;
  }
  if (outputShape === "checklist" || outputShape === "sectioned" || outputShape === "code") {
    complexityScore += 0.1;
  }

  return {
    firstUserMessage,
    toolNames,
    uniqueToolNames,
    orderedToolNames,
    intentFingerprint,
    toolSequenceFingerprint,
    outputShape,
    explicitUserReuseSignal,
    complexityScore: Math.max(0, Math.min(1, Number(complexityScore.toFixed(2)))),
    transcript,
  };
}

export function buildRunSignature(run: RunRecord): string {
  const signals = deriveRunLearningSignals(run);
  const raw = `${run.agentId}|${signals.intentFingerprint}|${signals.toolSequenceFingerprint}|${signals.outputShape}`;
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

  return { ok: true };
}

export function runHasFailureSignal(run: RunRecord): boolean {
  return run.log.some((event) => event.type === "error" || event.type === "run-stopped");
}

function findBestRelatedWorkspaceSkill(
  signals: RunLearningSignals,
  loadedSkills: LoadedSkill[],
  workspaceSkills: Array<{ name: string; description: string; tags?: string[]; content?: string }>
): RelatedSkillMatch | null {
  const loadedWorkspaceSkill = loadedSkills.find((skill) => skill.source === "workspace");
  if (loadedWorkspaceSkill) {
    return { name: loadedWorkspaceSkill.name, score: 1 };
  }

  const queryWords = new Set(normalizeWords(signals.firstUserMessage));
  let best: RelatedSkillMatch | null = null;

  for (const skill of workspaceSkills) {
    const skillWords = new Set(
      normalizeWords(`${skill.name} ${skill.description} ${(skill.tags ?? []).join(" ")}`)
    );

    let overlap = 0;
    for (const word of queryWords) {
      if (skillWords.has(word)) {
        overlap += 1;
      }
    }

    const nameMatchesTool = signals.orderedToolNames.some((toolName) =>
      skill.name.includes(toolName.replace(/[^a-z0-9]+/gi, "-").toLowerCase())
    );
    const score = Math.min(
      1,
      overlap * 0.22 +
        (nameMatchesTool ? 0.15 : 0) +
        (skill.name.includes("workflow") ? 0.08 : 0)
    );

    if (score >= 0.32 && (!best || score > best.score)) {
      best = {
        name: skill.name,
        score: Number(score.toFixed(2)),
        description: skill.description,
        tags: skill.tags,
        content: skill.content,
      };
    }
  }

  return best;
}

function computeRecurrenceScore(
  stateRepo: LearningStateRepo,
  signature: string,
  signals: RunLearningSignals,
  relatedSkillName?: string
): number {
  const related = stateRepo.findRelatedCandidates({
    signature,
    intentFingerprint: signals.intentFingerprint,
    toolSequenceFingerprint: signals.toolSequenceFingerprint,
    relatedSkillName,
  });
  if (!related.length) {
    return 0;
  }

  const occurrenceWeight = related.reduce((sum, candidate) => sum + candidate.occurrences, 0);
  return Math.max(0, Math.min(1, Number((Math.min(occurrenceWeight, 4) * 0.22).toFixed(2))));
}

export function scoreRunForLearning(input: {
  signals: RunLearningSignals;
  recurrenceScore: number;
  relatedSkillScore?: number;
}): number {
  const score =
    input.signals.complexityScore * 0.55 +
    input.recurrenceScore * 0.3 +
    (input.relatedSkillScore ?? 0) * 0.1 +
    (input.signals.explicitUserReuseSignal ? 0.18 : 0);
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function summarizeRelatedSkillForPrompt(relatedWorkspaceSkill: RelatedSkillMatch | null): string {
  if (!relatedWorkspaceSkill) {
    return "none";
  }

  const sections = [
    `Name: ${relatedWorkspaceSkill.name}`,
    `Score: ${relatedWorkspaceSkill.score}`,
  ];

  if (relatedWorkspaceSkill.description) {
    sections.push(`Description: ${relatedWorkspaceSkill.description}`);
  }

  if (relatedWorkspaceSkill.tags?.length) {
    sections.push(`Tags: ${relatedWorkspaceSkill.tags.join(", ")}`);
  }

  if (relatedWorkspaceSkill.content) {
    sections.push(
      `Excerpt:\n${relatedWorkspaceSkill.content.replace(/\s+/g, " ").slice(0, 600)}`
    );
  }

  return sections.join("\n");
}

export function normalizeLearningDecision(input: {
  decision: LearningDecision;
  relatedWorkspaceSkill: RelatedSkillMatch | null;
  recurrenceScore: number;
}): LearningDecision {
  const { decision, relatedWorkspaceSkill, recurrenceScore } = input;

  if (decision.action === "create" && relatedWorkspaceSkill) {
    const normalizedCreateName = slugifySkillName(decision.name);
    const normalizedRelatedName = slugifySkillName(relatedWorkspaceSkill.name);
    const looksLikeVariantOfExistingSkill =
      normalizedCreateName === normalizedRelatedName ||
      normalizedCreateName.includes(normalizedRelatedName) ||
      normalizedRelatedName.includes(normalizedCreateName);

    if (
      relatedWorkspaceSkill.score >= 0.7 &&
      (looksLikeVariantOfExistingSkill || recurrenceScore >= 0.44)
    ) {
      return {
        action: "update",
        targetSkill: relatedWorkspaceSkill.name,
        content: decision.content,
        rationale:
          decision.rationale ||
          `Normalized create->update because '${relatedWorkspaceSkill.name}' already strongly matches this workflow.`,
      };
    }
  }

  return decision;
}

function buildPrompt(input: {
  run: RunRecord;
  signals: RunLearningSignals;
  loadedSkills: LoadedSkill[];
  relatedWorkspaceSkill: RelatedSkillMatch | null;
  promoteNow: boolean;
  learningScore: number;
  recurrenceScore: number;
}): string {
  const { run, signals, loadedSkills, relatedWorkspaceSkill, promoteNow, learningScore, recurrenceScore } = input;
  const loadedSkillLines = loadedSkills.length
    ? loadedSkills.map((skill) => `- ${skill.name} (${skill.source})`).join("\n")
    : "- none";
  const relatedSkillLine = relatedWorkspaceSkill
    ? `${relatedWorkspaceSkill.name} (score=${relatedWorkspaceSkill.score})`
    : "none";
  const relatedSkillSummary = summarizeRelatedSkillForPrompt(relatedWorkspaceSkill);

  return [
    "You are the Flazz skill-learning controller.",
    "Decide whether this successful run should create a new reusable skill, update an existing workspace skill, or do nothing.",
    "Prefer update when the run appears to refine, repair, or extend a workspace skill, even if that skill was not explicitly loaded during the run.",
    "Prefer create for reusable, multi-step workflows with clear repeated intent or structure.",
    "Do not create skills for one-off answers, pure writing tasks, or simple lookups.",
    `A new skill may only be promoted now if promoteNow=${promoteNow}. If promoteNow is false, you may still return action=create to draft a candidate skill, but only if the workflow is genuinely reusable.`,
    "If there is a strong related workspace skill candidate, prefer action=update unless the run clearly defines a separate reusable workflow.",
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
    `First user request: ${signals.firstUserMessage || "(none)"}`,
    `Tool calls (${signals.toolNames.length}): ${signals.toolNames.join(", ")}`,
    `Learning score: ${learningScore}`,
    `Recurrence score: ${recurrenceScore}`,
    `Output shape: ${signals.outputShape}`,
    `Explicit reuse signal: ${signals.explicitUserReuseSignal}`,
    "Loaded skills:",
    loadedSkillLines,
    `Related workspace skill candidate: ${relatedSkillLine}`,
    `Related workspace skill context:\n${relatedSkillSummary}`,
    "",
    "Transcript:",
    signals.transcript,
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
    const signals = deriveRunLearningSignals(run);
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

    try {
      const modelConfig = await this.modelConfigRepo.getConfig();
      if (!modelConfig) {
        return;
      }

      const workspaceSkills = (await this.skillRegistry.list())
        .filter((skill) => skill.source === "workspace")
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          tags: skill.tags,
          content: skill.content,
        }));
      const relatedWorkspaceSkill = findBestRelatedWorkspaceSkill(
        signals,
        loadedSkills,
        workspaceSkills
      );
      const signature = buildRunSignature(run);
      const recurrenceScore = computeRecurrenceScore(
        this.stateRepo,
        signature,
        signals,
        relatedWorkspaceSkill?.name
      );
      const learningScore = scoreRunForLearning({
        signals,
        recurrenceScore,
        relatedSkillScore: relatedWorkspaceSkill?.score,
      });

      if (learningScore < CANDIDATE_SCORE_THRESHOLD) {
        console.log(
          `[SkillLearning] Skipping run ${run.id}: score ${learningScore} below candidate threshold ${CANDIDATE_SCORE_THRESHOLD}.`
        );
        return;
      }

      this.processedRunIds.add(run.id);

      const observedCandidate = this.stateRepo.bumpCandidate(signature, run.id, undefined, {
        relatedSkillName: relatedWorkspaceSkill?.name,
        intentFingerprint: signals.intentFingerprint,
        toolSequenceFingerprint: signals.toolSequenceFingerprint,
        outputShape: signals.outputShape,
        explicitUserReuseSignal: signals.explicitUserReuseSignal,
        complexityScore: signals.complexityScore,
        recurrenceScore,
      });
      const promoteNow =
        signals.explicitUserReuseSignal ||
        (observedCandidate.occurrences >= PROMOTION_OCCURRENCE_THRESHOLD &&
          observedCandidate.confidence >= PROMOTION_SCORE_THRESHOLD);

      const provider = createProvider(modelConfig.provider);
      const model = provider.languageModel(modelConfig.model);
      const response = streamText({
        model,
        system: [
          "You are the Flazz skill-learning controller.",
          "You MUST respond with a single JSON object and NOTHING else.",
          "Do NOT include markdown, prose, explanations, or code fences.",
          "Your entire response must be parseable by JSON.parse().",
          "Valid actions: none | create | update. See schema in the prompt.",
        ].join(" "),
        prompt: buildPrompt({
          run,
          signals,
          loadedSkills,
          relatedWorkspaceSkill,
          promoteNow,
          learningScore,
          recurrenceScore,
        }),
      });

      const parsed = LearningDecision.safeParse(
        parseLearningDecisionPayload(await response.text)
      );

      if (!parsed.success) {
        console.warn(`[SkillLearning] Invalid learning output for run ${run.id}`);
        return;
      }

      const normalizedDecision = normalizeLearningDecision({
        decision: parsed.data,
        relatedWorkspaceSkill,
        recurrenceScore,
      });

      await this.persistDecision(run, signature, normalizedDecision, {
        signals,
        relatedWorkspaceSkill,
        recurrenceScore,
        learningScore,
      });
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
    relatedSkillName?: string;
    recentRunIds: string[];
    intentFingerprint?: string;
    toolSequenceFingerprint?: string;
    outputShape?: string;
    explicitUserReuseSignal: boolean;
    complexityScore: number;
    recurrenceScore: number;
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
    highConfidenceCandidateCount: number;
    averageCandidateConfidence: number;
  } {
    const state = this.stateRepo.getState();
    const candidates = Object.values(state.candidates);
    const averageCandidateConfidence =
      candidates.length > 0
        ? Number(
            (
              candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) /
              candidates.length
            ).toFixed(2)
          )
        : 0;
    return {
      candidateCount: candidates.length,
      pendingCandidateCount: candidates.filter((candidate) => candidate.status === "pending").length,
      promotedCandidateCount: candidates.filter((candidate) => candidate.status === "promoted").length,
      rejectedCandidateCount: candidates.filter((candidate) => candidate.status === "rejected").length,
      trackedSkillCount: Object.keys(state.skills).length,
      repairCandidateCount: Object.keys(state.repairs).length,
      highConfidenceCandidateCount: candidates.filter((candidate) => candidate.confidence >= 0.75).length,
      averageCandidateConfidence,
    };
  }

  private async persistDecision(
    run: RunRecord,
    signature: string,
    decision: LearningDecision,
    context: {
      signals: RunLearningSignals;
      relatedWorkspaceSkill: RelatedSkillMatch | null;
      recurrenceScore: number;
      learningScore: number;
    }
  ): Promise<void> {
    if (decision.action === "none") {
      this.stateRepo.updateCandidateDraft(signature, {
        rationale: decision.rationale,
        relatedSkillName: context.relatedWorkspaceSkill?.name,
        explicitUserReuseSignal: context.signals.explicitUserReuseSignal,
        complexityScore: context.signals.complexityScore,
        recurrenceScore: context.recurrenceScore,
      });
      console.log(`[SkillLearning] No action for run ${run.id}: ${decision.rationale || "model declined"}`);
      return;
    }

    if (decision.action === "update") {
      await this.updateExistingSkill(run, decision);
      return;
    }

    await this.createOrPromoteSkill(run, signature, decision, context);
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
    decision: Extract<LearningDecision, { action: "create" }>,
    context: {
      signals: RunLearningSignals;
      relatedWorkspaceSkill: RelatedSkillMatch | null;
      recurrenceScore: number;
      learningScore: number;
    }
  ): Promise<void> {
    const name = slugifySkillName(decision.name);
    if (!name) {
      return;
    }

    const existing = await this.skillManager.get(name);
    if (existing) {
      if (context.relatedWorkspaceSkill?.name === existing.name) {
        await this.updateExistingSkill(run, {
          action: "update",
          targetSkill: existing.name,
          content: decision.content,
          rationale:
            decision.rationale ||
            `Promoted create->update because '${existing.name}' already exists as the closest workspace skill.`,
        });
        return;
      }

      console.log(`[SkillLearning] Skill '${name}' already exists, skipping auto-create.`);
      return;
    }

    const candidate =
      this.stateRepo.getCandidate(signature) ??
      this.stateRepo.bumpCandidate(signature, run.id, name, {
        relatedSkillName: context.relatedWorkspaceSkill?.name,
        intentFingerprint: context.signals.intentFingerprint,
        toolSequenceFingerprint: context.signals.toolSequenceFingerprint,
        outputShape: context.signals.outputShape,
        explicitUserReuseSignal: context.signals.explicitUserReuseSignal,
        complexityScore: context.signals.complexityScore,
        recurrenceScore: context.recurrenceScore,
      });
    this.stateRepo.updateCandidateDraft(signature, {
      proposedSkillName: name,
      proposedCategory: decision.category,
      proposedDescription: decision.description,
      draftContent: decision.content,
      rationale: decision.rationale,
      relatedSkillName: context.relatedWorkspaceSkill?.name,
      explicitUserReuseSignal: context.signals.explicitUserReuseSignal,
      complexityScore: context.signals.complexityScore,
      recurrenceScore: context.recurrenceScore,
    });
    const userExplicitlyAskedToRemember = context.signals.explicitUserReuseSignal;

    if (
      !userExplicitlyAskedToRemember &&
      (candidate.occurrences < PROMOTION_OCCURRENCE_THRESHOLD ||
        candidate.confidence < PROMOTION_SCORE_THRESHOLD)
    ) {
      console.log(
        `[SkillLearning] Stored candidate '${name}' from run ${run.id}; waiting for stronger recurrence (${candidate.occurrences}/${PROMOTION_OCCURRENCE_THRESHOLD}, confidence=${candidate.confidence}).`
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
