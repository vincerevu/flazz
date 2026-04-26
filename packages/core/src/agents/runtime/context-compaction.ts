import crypto from "crypto";
import { generateText, LanguageModel } from "ai";
import { MessageList } from "@flazz/shared";
import { z } from "zod";
import { hasCompleteToolReferences } from "./history-window.js";
import type { AutoContinueReason } from "./auto-continue.js";
import { pruneToolOutputs } from "./context-pruner.js";
import { isAutoContinueMessage } from "./auto-continue.js";

type Message = z.infer<typeof MessageList>[number];

export type StructuredCarryover = {
  goal: string[];
  instructions: string[];
  decisions: string[];
  progress: string[];
  relevantFilesAndTools: string[];
  openQuestionsNextSteps: string[];
};

export type ActiveTaskState = {
  objective: string[];
  constraints: string[];
  decisions: string[];
  progress: string[];
  nextSteps: string[];
  references: string[];
};

export interface CompactionSnapshot {
  summary: string;
  carryover: StructuredCarryover;
  taskState: ActiveTaskState;
  anchorHash: string;
  provenanceRefs: string[];
  omittedMessages: number;
  recentMessages: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  tokensSaved: number;
  reductionPercent: number;
  reused: boolean;
  recentWindowStart: number;
  protectedWindowReasons: string[];
  operationalMessageCountAfter: number;
  baselineMode: "full-history" | "summary-recent-window";
}

export interface PreparedCompactedContext {
  messages: z.infer<typeof MessageList>;
  snapshot?: CompactionSnapshot;
  /** Set when the caller should inject an auto-continue user message after compaction */
  autoContinue?: AutoContinueReason;
}

const CHARS_PER_TOKEN = 4;
const TOOL_RESULT_CHAR_LIMIT = 400;
const TEXT_CHAR_LIMIT = 1200;
const REASONING_CHAR_LIMIT = 500;
const SUMMARY_CHAR_LIMIT = 12_000;

/**
 * Conservative token estimate for a single file/image attachment.
 *
 * Why 512:
 * - GPT-4o low-detail mode costs 85 tokens; high-detail tiles add 170 each.
 * - Gemini 1.5 charges ~258 tokens for a typical web image.
 * - 512 is the practical floor for an average-resolution image across providers.
 * - Using 512 instead of the previous flat 64 prevents gross undercount on
 *   vision-heavy runs without requiring a pixel-level calculation at runtime.
 *
 * If you later want model-specific accuracy, gate on `mimeType.startsWith("image/")`
 * and use the provider token-counting API before sending.
 */
const ATTACHMENT_TOKEN_ESTIMATE = 512;


function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 17))}\n...[truncated]`;
}

export function estimateMessageTokens(message: Message): number {
  if (message.actualTokens !== undefined) {
    return message.actualTokens;
  }

  if (message.role === "user") {
    if (typeof message.content === "string") {
      return Math.ceil(message.content.length / CHARS_PER_TOKEN);
    }
    return Math.ceil(
      message.content.reduce((sum, part) => {
        if (part.type === "text") return sum + part.text.length;
        // File / image attachment: use calibrated estimate instead of flat 64.
        return sum + part.filename.length + part.path.length + part.mimeType.length + ATTACHMENT_TOKEN_ESTIMATE * CHARS_PER_TOKEN;
      }, 0) / CHARS_PER_TOKEN,
    );
  }

  if (message.role === "assistant") {
    if (typeof message.content === "string") {
      return Math.ceil(message.content.length / CHARS_PER_TOKEN);
    }
    return Math.ceil(
      message.content.reduce((sum, part) => {
        if (part.type === "text" || part.type === "reasoning") {
          return sum + part.text.length;
        }
        return sum + part.toolName.length + JSON.stringify(part.arguments ?? {}).length + 64;
      }, 0) / CHARS_PER_TOKEN,
    );
  }

  if (message.role === "tool") {
    return Math.ceil((message.content.length + message.toolName.length + 64) / CHARS_PER_TOKEN);
  }

  return Math.ceil(message.content.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: z.infer<typeof MessageList>): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

export function selectRecentMessagesWithinBudget(
  messages: z.infer<typeof MessageList>,
  budgetTokens: number,
): z.infer<typeof MessageList> {
  let accumulated = 0;
  let startIndex = messages.length;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const nextTokens = estimateMessageTokens(messages[index]);
    const wouldExceed = accumulated + nextTokens > budgetTokens;

    if (wouldExceed) {
      break;
    }

    accumulated += nextTokens;
    startIndex = index;
  }

  // Ensure tool call references are complete by expanding backward if necessary
  while (startIndex > 0 && !hasCompleteToolReferences(messages.slice(startIndex))) {
    startIndex -= 1;
  }

  return messages.slice(startIndex);
}

function compactHash(messages: z.infer<typeof MessageList>): string {
  const serialized = JSON.stringify(messages);
  return crypto.createHash("sha1").update(serialized).digest("hex");
}

type AdaptiveRecentWindowOptions = {
  budgetTokens: number;
  pendingToolCallIds?: string[];
  referenceHints?: string[];
  preserveLatestUserTurns?: number;
};

type AdaptiveRecentWindowSelection = {
  messages: z.infer<typeof MessageList>;
  startIndex: number;
  protectedWindowReasons: string[];
};

function buildSnapshot(args: {
  summary: string;
  carryover: StructuredCarryover;
  taskState: ActiveTaskState;
  anchorHash: string;
  provenanceRefs: string[];
  omittedMessages: number;
  recentMessages: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  reused: boolean;
  recentWindowStart: number;
  protectedWindowReasons: string[];
  operationalMessageCountAfter: number;
  baselineMode: "full-history" | "summary-recent-window";
}): CompactionSnapshot {
  const tokensSaved = Math.max(0, args.estimatedTokensBefore - args.estimatedTokensAfter);
  const reductionPercent = args.estimatedTokensBefore > 0
    ? Math.max(0, Math.min(100, Math.round((tokensSaved / args.estimatedTokensBefore) * 100)))
    : 0;

  return {
    summary: args.summary,
    carryover: args.carryover,
    taskState: args.taskState,
    anchorHash: args.anchorHash,
    provenanceRefs: args.provenanceRefs,
    omittedMessages: args.omittedMessages,
    recentMessages: args.recentMessages,
    estimatedTokensBefore: args.estimatedTokensBefore,
    estimatedTokensAfter: args.estimatedTokensAfter,
    tokensSaved,
    reductionPercent,
    reused: args.reused,
    recentWindowStart: args.recentWindowStart,
    protectedWindowReasons: args.protectedWindowReasons,
    operationalMessageCountAfter: args.operationalMessageCountAfter,
    baselineMode: args.baselineMode,
  };
}

export function deriveActiveTaskState(carryover: StructuredCarryover): ActiveTaskState {
  return {
    objective: carryover.goal.slice(0, 4),
    constraints: carryover.instructions.slice(0, 6),
    decisions: carryover.decisions.slice(0, 6),
    progress: carryover.progress.slice(0, 6),
    nextSteps: carryover.openQuestionsNextSteps.slice(0, 6),
    references: carryover.relevantFilesAndTools.slice(0, 8),
  };
}

function extractProvenanceRefs(messages: z.infer<typeof MessageList>, carryover: StructuredCarryover): string[] {
  const refs = new Set<string>();

  for (const entry of carryover.relevantFilesAndTools) {
    const normalized = entry.trim();
    if (normalized) refs.add(normalized);
  }

  const urlPattern = /https?:\/\/[^\s)]+/g;
  const pathPattern = /[A-Za-z]:\\[^\s]+|\/[^\s]+/g;

  for (const message of messages) {
    if (message.role === "user" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type !== "attachment") continue;
        refs.add(part.path);
      }
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "tool-call") {
          refs.add(`tool:${part.toolName}`);
        }
      }
    }

    if (message.role === "tool") {
      refs.add(`tool:${message.toolName}`);
    }

    const text = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

    for (const match of text.match(urlPattern) ?? []) {
      refs.add(match);
    }
    for (const match of text.match(pathPattern) ?? []) {
      if (match.length <= 3) continue;
      refs.add(match);
    }
  }

  return Array.from(refs).slice(0, 12);
}

export function parseCarryover(summary: string): StructuredCarryover {
  const headings = [
    ["## Goal", "goal"],
    ["## Instructions", "instructions"],
    ["## Decisions", "decisions"],
    ["## Progress", "progress"],
    ["## Relevant Files and Tools", "relevantFilesAndTools"],
    ["## Open Questions / Next Steps", "openQuestionsNextSteps"],
  ] as const;

  const output: StructuredCarryover = {
    goal: [],
    instructions: [],
    decisions: [],
    progress: [],
    relevantFilesAndTools: [],
    openQuestionsNextSteps: [],
  };

  let currentKey: keyof StructuredCarryover | null = null;
  for (const line of summary.split(/\r?\n/)) {
    const heading = headings.find(([label]) => line.trim() === label);
    if (heading) {
      currentKey = heading[1];
      continue;
    }
    if (!currentKey) continue;
    const normalized = line.trim().replace(/^[-*]\s*/, "");
    if (normalized) {
      output[currentKey].push(normalized);
    }
  }

  return output;
}

function previousMeaningfulUserIndex(
  messages: z.infer<typeof MessageList>,
  fromIndex: number,
): number | null {
  for (let index = Math.min(fromIndex, messages.length - 1); index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    if (isAutoContinueMessage(message)) continue;
    return index;
  }
  return null;
}

function findToolCallContextStart(
  messages: z.infer<typeof MessageList>,
  toolCallId: string,
): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && Array.isArray(message.content)) {
      const hasToolCall = message.content.some((part) => (
        part.type === "tool-call" && part.toolCallId === toolCallId
      ));
      if (!hasToolCall) continue;
      return previousMeaningfulUserIndex(messages, index) ?? index;
    }
    if (message.role === "tool" && message.toolCallId === toolCallId) {
      return previousMeaningfulUserIndex(messages, index) ?? index;
    }
  }
  return null;
}

function findLatestReferencedContextStart(
  messages: z.infer<typeof MessageList>,
  referenceHints: string[],
): number | null {
  if (referenceHints.length === 0) return null;
  const normalizedHints = referenceHints
    .map((hint) => hint.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (normalizedHints.length === 0) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);
    if (!normalizedHints.some((hint) => content.includes(hint))) continue;
    return previousMeaningfulUserIndex(messages, index) ?? index;
  }

  return null;
}

function findLatestActiveToolChainStart(messages: z.infer<typeof MessageList>): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "tool") {
      return previousMeaningfulUserIndex(messages, index) ?? index;
    }
    if (message.role === "assistant" && Array.isArray(message.content)) {
      const hasToolCall = message.content.some((part) => part.type === "tool-call");
      if (hasToolCall) {
        return previousMeaningfulUserIndex(messages, index) ?? index;
      }
    }
  }
  return null;
}

function selectAdaptiveRecentMessages(
  messages: z.infer<typeof MessageList>,
  options: AdaptiveRecentWindowOptions,
): AdaptiveRecentWindowSelection {
  const baseRecentMessages = selectRecentMessagesWithinBudget(messages, options.budgetTokens);
  let startIndex = Math.max(0, messages.length - baseRecentMessages.length);
  const protectedWindowReasons: string[] = [];
  const preserveLatestUserTurns = Math.max(1, options.preserveLatestUserTurns ?? 2);

  const protectFromIndex = (candidate: number | null, reason: string) => {
    if (candidate == null || candidate >= startIndex) return;
    startIndex = candidate;
    protectedWindowReasons.push(reason);
  };

  let searchFrom = messages.length - 1;
  for (let count = 0; count < preserveLatestUserTurns; count += 1) {
    const userIndex = previousMeaningfulUserIndex(messages, searchFrom);
    if (userIndex == null) break;
    protectFromIndex(userIndex, count === 0 ? "latest-user-turn" : `latest-user-turn-${count + 1}`);
    searchFrom = userIndex - 1;
  }

  for (const toolCallId of options.pendingToolCallIds ?? []) {
    protectFromIndex(findToolCallContextStart(messages, toolCallId), `pending-tool:${toolCallId}`);
  }

  protectFromIndex(findLatestActiveToolChainStart(messages), "active-tool-chain");
  protectFromIndex(findLatestReferencedContextStart(messages, options.referenceHints ?? []), "task-reference");

  while (startIndex > 0 && !hasCompleteToolReferences(messages.slice(startIndex))) {
    startIndex -= 1;
    if (!protectedWindowReasons.includes("complete-tool-references")) {
      protectedWindowReasons.push("complete-tool-references");
    }
  }

  return {
    messages: messages.slice(startIndex),
    startIndex,
    protectedWindowReasons,
  };
}

function pruneMessageForTranscript(message: Message): Message {
  if (message.role === "tool") {
    return {
      ...message,
      content: truncate(message.content, TOOL_RESULT_CHAR_LIMIT),
    };
  }

  if (message.role === "assistant" && Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type === "text") {
          return { ...part, text: truncate(part.text, TEXT_CHAR_LIMIT) };
        }
        if (part.type === "reasoning") {
          return { ...part, text: truncate(part.text, REASONING_CHAR_LIMIT) };
        }
        return {
          ...part,
          arguments: truncate(JSON.stringify(part.arguments ?? {}), TOOL_RESULT_CHAR_LIMIT),
        };
      }),
    };
  }

  if (message.role === "assistant" && typeof message.content === "string") {
    return {
      ...message,
      content: truncate(message.content, TEXT_CHAR_LIMIT),
    };
  }

  if (message.role === "user" && typeof message.content === "string") {
    return {
      ...message,
      content: truncate(message.content, TEXT_CHAR_LIMIT),
    };
  }

  if (message.role === "user" && Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content.map((part) => (
        part.type === "text"
          ? { ...part, text: truncate(part.text, TEXT_CHAR_LIMIT) }
          : part
      )),
    };
  }

  return message;
}

function messageToTranscript(message: Message): string {
  if (message.role === "user") {
    if (typeof message.content === "string") {
      return `USER:\n${message.content}`;
    }
    const rendered = message.content.map((part) => {
      if (part.type === "text") return part.text;
      return `[Attachment] ${part.filename} (${part.mimeType}) at ${part.path}`;
    }).join("\n");
    return `USER:\n${rendered}`;
  }

  if (message.role === "assistant") {
    if (typeof message.content === "string") {
      return `ASSISTANT:\n${message.content}`;
    }
    const rendered = message.content.map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "reasoning") return `[Reasoning summary]\n${part.text}`;
      return `[Tool call] ${part.toolName}\n${typeof part.arguments === "string" ? part.arguments : JSON.stringify(part.arguments ?? {})}`;
    }).join("\n");
    return `ASSISTANT:\n${rendered}`;
  }

  if (message.role === "tool") {
    return `TOOL RESULT (${message.toolName}):\n${message.content}`;
  }

  return `SYSTEM:\n${message.content}`;
}

function buildCarryoverText(carryover: StructuredCarryover): string {
  const sections: Array<[string, string[]]> = [
    ["## Goal", carryover.goal],
    ["## Instructions", carryover.instructions],
    ["## Decisions", carryover.decisions],
    ["## Progress", carryover.progress],
    ["## Relevant Files and Tools", carryover.relevantFilesAndTools],
    ["## Open Questions / Next Steps", carryover.openQuestionsNextSteps],
  ];

  return sections.map(([title, items]) => [
    title,
    ...(items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"]),
  ].join("\n")).join("\n\n");
}

function buildTaskStateText(taskState: ActiveTaskState): string {
  const sections: Array<[string, string[]]> = [
    ["Current objective", taskState.objective],
    ["Constraints", taskState.constraints],
    ["Important decisions", taskState.decisions],
    ["Progress", taskState.progress],
    ["Next steps", taskState.nextSteps],
    ["References", taskState.references],
  ];

  return sections.map(([title, items]) => [
    `${title}:`,
    ...(items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"]),
  ].join("\n")).join("\n\n");
}

function buildSummaryPrompt(
  olderMessages: z.infer<typeof MessageList>,
  previousSummary?: string | null,
  previousCarryover?: StructuredCarryover | null,
  previousTaskState?: ActiveTaskState | null,
): string {
  const pruned = olderMessages.map(pruneMessageForTranscript);
  const transcript = pruned.map(messageToTranscript).join("\n\n---\n\n");

  return [
    "Create a structured carryover for a future agent handoff.",
    "Respond in the same language the user has mostly been using.",
    "Do not answer the user's requests. Do not call tools. Do not add speculation.",
    "Keep the result concise, factual, and technically complete. Discard intermediary thought processes.",
    "Skip verbose explanations. Extract only Facts, File paths read, and Variables.",
    "Each section should contain short bullet points only.",
    "Preserve task state, decisions, blockers, files, tools, and next steps.",
    "Use this exact structure:",
    "## Goal",
    "## Instructions",
    "## Decisions",
    "## Progress",
    "## Relevant Files and Tools",
    "## Open Questions / Next Steps",
    previousSummary
      ? `Existing carryover to update and refine:\n${truncate(previousSummary, SUMMARY_CHAR_LIMIT)}`
      : previousCarryover
        ? `Existing structured carryover:\n${buildCarryoverText(previousCarryover)}`
      : previousTaskState
        ? `Existing active task state:\n${buildTaskStateText(previousTaskState)}`
      : "",
    `Conversation segment to compress:\n${transcript}`,
  ].filter(Boolean).join("\n\n");
}

export function buildCompactionReferenceMessage(
  summary: string,
  carryover?: StructuredCarryover,
  taskState?: ActiveTaskState,
): Message {
  const body = taskState
    ? `${buildTaskStateText(taskState)}\n\n${carryover ? buildCarryoverText(carryover) : summary}`
    : (carryover ? buildCarryoverText(carryover) : summary);
  return {
    role: "system",
    content: [
      "[COMPACTED CONTEXT / REFERENCE ONLY]",
      "Earlier conversation turns were summarized to stay within the context budget.",
      "Treat this as background state, not as a new user request.",
      "Do not repeat completed work just because it appears here.",
      "",
      body,
    ].join("\n"),
  };
}

export async function prepareCompactedContext(args: {
  messages: z.infer<typeof MessageList>;
  model: LanguageModel;
  signal?: AbortSignal;
  recentBudgetTokens?: number;
  previousSummary?: string | null;
  previousAnchorHash?: string | null;
  previousCarryover?: StructuredCarryover | null;
  previousTaskState?: ActiveTaskState | null;
  /** Reason surfaced to the caller for auto-continue injection */
  reason?: AutoContinueReason;
  pendingToolCallIds?: string[];
  referenceHints?: string[];
  /**
   * Skip the pre-compaction prune step.
   * Set to true if pruneToolOutputs() was already called by the caller.
   */
  skipPrune?: boolean;
}): Promise<PreparedCompactedContext> {
  // Optionally prune old tool outputs before selecting the recent window.
  // This reduces pressure on recentBudgetTokens and may avoid needing to
  // summarise anything at all if the pruned messages fit within budget.
  const workingMessages = args.skipPrune
    ? args.messages
    : pruneToolOutputs(args.messages).messages;

  const recentWindow = selectAdaptiveRecentMessages(workingMessages, {
    budgetTokens: args.recentBudgetTokens ?? 32_000,
    pendingToolCallIds: args.pendingToolCallIds,
    referenceHints: args.referenceHints,
  });
  const recentMessages = recentWindow.messages;
  const startIndex = recentWindow.startIndex;
  const omitted = workingMessages.slice(0, startIndex);

  if (omitted.length === 0) {
    return { messages: recentMessages, autoContinue: args.reason };
  }

  const anchorHash = compactHash(omitted);
  const estimatedTokensBefore = estimateMessagesTokens(workingMessages);

  if (args.previousSummary && (!args.previousAnchorHash || args.previousAnchorHash === anchorHash)) {
    const carryover = args.previousCarryover ?? parseCarryover(args.previousSummary);
    const taskState = args.previousTaskState ?? deriveActiveTaskState(carryover);
    const summaryMessage = buildCompactionReferenceMessage(args.previousSummary, carryover, taskState);
    const compactedMessages = [summaryMessage, ...recentMessages];
    return {
      messages: compactedMessages,
      autoContinue: args.reason,
      snapshot: buildSnapshot({
        summary: args.previousSummary,
        carryover,
        taskState,
        anchorHash,
        provenanceRefs: extractProvenanceRefs(omitted, carryover),
        omittedMessages: omitted.length,
        recentMessages: recentMessages.length,
        estimatedTokensBefore,
        estimatedTokensAfter: estimateMessagesTokens(compactedMessages),
        reused: true,
        recentWindowStart: startIndex,
        protectedWindowReasons: recentWindow.protectedWindowReasons,
        operationalMessageCountAfter: compactedMessages.length,
        baselineMode: "summary-recent-window",
      }),
    };
  }

  // SAFEGUARD: If omitted messages to be summarized are too large,
  // take only the most recent ones that fit within a safe budget.
  // 20k tokens keeps the compaction call well within small/free model limits
  // (minimax-m2.5-free, etc.) while still capturing meaningful history.
  const SUMMARIZATION_INPUT_BUDGET_TOKENS = 20_000;
  const safeOmitted = selectRecentMessagesWithinBudget(
    omitted,
    SUMMARIZATION_INPUT_BUDGET_TOKENS
  );

  const response = await generateText({
    model: args.model,
    prompt: buildSummaryPrompt(safeOmitted, args.previousSummary, args.previousCarryover),
    abortSignal: args.signal,
  });

  const summary = response.text.trim();
  const carryover = parseCarryover(summary);
  const taskState = deriveActiveTaskState(carryover);
  const summaryMessage = buildCompactionReferenceMessage(summary, carryover, taskState);
  const compactedMessages = [summaryMessage, ...recentMessages];

  return {
    messages: compactedMessages,
    autoContinue: args.reason,
    snapshot: buildSnapshot({
      summary,
      carryover,
      taskState,
      anchorHash,
      provenanceRefs: extractProvenanceRefs(omitted, carryover),
      omittedMessages: omitted.length,
      recentMessages: recentMessages.length,
      estimatedTokensBefore,
      estimatedTokensAfter: estimateMessagesTokens(compactedMessages),
      reused: false,
      recentWindowStart: startIndex,
      protectedWindowReasons: recentWindow.protectedWindowReasons,
      operationalMessageCountAfter: compactedMessages.length,
      baselineMode: "summary-recent-window",
    }),
  };
}
