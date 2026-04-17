import crypto from "crypto";
import { generateText, LanguageModel } from "ai";
import { MessageList } from "@flazz/shared";
import { z } from "zod";
import { buildSafeRecentMessages } from "./history-window.js";

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
}

export interface PreparedCompactedContext {
  messages: z.infer<typeof MessageList>;
  snapshot?: CompactionSnapshot;
}

const CHARS_PER_TOKEN = 4;
const TOOL_RESULT_CHAR_LIMIT = 400;
const TEXT_CHAR_LIMIT = 1200;
const REASONING_CHAR_LIMIT = 500;
const SUMMARY_CHAR_LIMIT = 12_000;
const DEFAULT_MAX_HISTORY = 20;
const EMPTY_CARRYOVER: StructuredCarryover = {
  goal: [],
  instructions: [],
  decisions: [],
  progress: [],
  relevantFilesAndTools: [],
  openQuestionsNextSteps: [],
};
const EMPTY_TASK_STATE: ActiveTaskState = {
  objective: [],
  constraints: [],
  decisions: [],
  progress: [],
  nextSteps: [],
  references: [],
};

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 17))}\n...[truncated]`;
}

export function estimateMessageTokens(message: Message): number {
  if (message.role === "user") {
    if (typeof message.content === "string") {
      return Math.ceil(message.content.length / CHARS_PER_TOKEN);
    }
    return Math.ceil(
      message.content.reduce((sum, part) => {
        if (part.type === "text") return sum + part.text.length;
        return sum + part.filename.length + part.path.length + part.mimeType.length + 64;
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
  minimumMessages = 20,
): z.infer<typeof MessageList> {
  if (messages.length <= minimumMessages) return messages;

  let accumulated = 0;
  let startIndex = messages.length;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const nextTokens = estimateMessageTokens(messages[index]);
    const wouldExceed = accumulated + nextTokens > budgetTokens;
    const protectedByMinimum = (messages.length - index) < minimumMessages;

    if (wouldExceed && !protectedByMinimum) {
      break;
    }

    accumulated += nextTokens;
    startIndex = index;
  }

  return buildSafeRecentMessages(messages.slice(startIndex), messages.length - startIndex);
}

function compactHash(messages: z.infer<typeof MessageList>): string {
  const serialized = JSON.stringify(messages);
  return crypto.createHash("sha1").update(serialized).digest("hex");
}

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
    "Keep the result concise, factual, and technically complete.",
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
  maxHistory?: number;
  recentBudgetTokens?: number;
  minimumRecentMessages?: number;
  previousSummary?: string | null;
  previousAnchorHash?: string | null;
  previousCarryover?: StructuredCarryover | null;
  previousTaskState?: ActiveTaskState | null;
}): Promise<PreparedCompactedContext> {
  const maxHistory = args.maxHistory ?? DEFAULT_MAX_HISTORY;
  const recentMessages = args.recentBudgetTokens
    ? selectRecentMessagesWithinBudget(
        args.messages,
        args.recentBudgetTokens,
        args.minimumRecentMessages ?? maxHistory,
      )
    : buildSafeRecentMessages(args.messages, maxHistory);
  const startIndex = args.messages.length - recentMessages.length;
  const omitted = args.messages.slice(0, startIndex);

  if (omitted.length === 0) {
    return { messages: recentMessages };
  }

  const anchorHash = compactHash(omitted);
  const estimatedTokensBefore = estimateMessagesTokens(args.messages);

  if (args.previousSummary && (!args.previousAnchorHash || args.previousAnchorHash === anchorHash)) {
    const carryover = args.previousCarryover ?? parseCarryover(args.previousSummary);
    const taskState = args.previousTaskState ?? deriveActiveTaskState(carryover);
    const summaryMessage = buildCompactionReferenceMessage(args.previousSummary, carryover, taskState);
    const compactedMessages = [summaryMessage, ...recentMessages];
    return {
      messages: compactedMessages,
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
      }),
    };
  }

  const response = await generateText({
    model: args.model,
    prompt: buildSummaryPrompt(omitted, args.previousSummary, args.previousCarryover),
    abortSignal: args.signal,
  });

  const summary = response.text.trim();
  const carryover = parseCarryover(summary);
  const taskState = deriveActiveTaskState(carryover);
  const summaryMessage = buildCompactionReferenceMessage(summary, carryover, taskState);
  const compactedMessages = [summaryMessage, ...recentMessages];

  return {
    messages: compactedMessages,
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
    }),
  };
}
