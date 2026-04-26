import { MessageList, LlmModelLimits, LlmProvider } from "@flazz/shared";
import { ToolSet } from "ai";
import { z } from "zod";
import { getCompactionConfig } from "../../config/compaction-config.js";
import { assessCompactionNeed, RuntimeCompactionConfig } from "./compaction-orchestrator.js";
import { buildSafeRecentMessages } from "./history-window.js";
import {
  estimatePromptTokens,
  resolveModelContextBudget,
  type ModelContextBudget,
} from "./model-context-budget.js";
import { checkOverflow, type OverflowCheckResult } from "./overflow-detector.js";
import { sanitizeMessagesForPrompt } from "./prompt-sanitizer.js";
import { trimMessagesForPrompt } from "./context-trim.js";
import { AgentState } from "./agent-state.js";

type RuntimeMessage = z.infer<typeof MessageList>[number];

export type TurnPreparationResult = {
  instructionsWithDateTime: string;
  promptMessages: z.infer<typeof MessageList>;
  operationalPromptSource: z.infer<typeof MessageList>;
  safeRecentMessages: z.infer<typeof MessageList>;
  budget: ModelContextBudget;
  compactionConfig: RuntimeCompactionConfig;
  overflowCheck: OverflowCheckResult;
  assessment: ReturnType<typeof assessCompactionNeed>;
  estimatedPromptTokens: number;
  sanitizedPromptSourceCount: number;
  trimmedPromptSourceCount: number;
  droppedMessages: number;
  downgradedMessages: number;
};

export type TurnPreparationContextBuilder = {
  buildContext(query: string, options: {
    includeMemory: boolean;
    includeSkills: boolean;
    includeMemorySearch: boolean;
  }): Promise<string[]>;
};

export const MINIMUM_RECENT_MESSAGES = 20;

export function extractMessageText(message?: RuntimeMessage | null): string {
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ");
}

export function extractFirstUserQuery(messages: z.infer<typeof MessageList>): string {
  return extractMessageText(messages.find((message) => message.role === "user"));
}

export function buildCompatibilityNote(args: {
  toolExecutionMode: "full" | "disabled";
  requestedToolCount: number;
}): string {
  return args.toolExecutionMode === "disabled" && args.requestedToolCount > 0
    ? "\n\nProvider compatibility note: Tool execution is disabled for this provider endpoint because it does not reliably return structured tool calls in Flazz. Do not claim to inspect tools, run MCP servers, browse, or execute actions. Answer directly with the information already available in the conversation and be explicit when tool access is unavailable."
    : "";
}

export async function prepareLlmTurn(args: {
  state: AgentState;
  agentInstructions: string;
  executionPolicy: {
    toolExecutionMode: "full" | "disabled";
  };
  requestedToolCount: number;
  tools: ToolSet;
  provider: z.infer<typeof LlmProvider>;
  modelId: string;
  modelLimits?: z.infer<typeof LlmModelLimits>;
  modelLimitSource?: "config" | "registry";
  contextBuilder: TurnPreparationContextBuilder;
  now?: Date;
}): Promise<TurnPreparationResult> {
  const now = args.now ?? new Date();
  const currentDateTime = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const compatibilityNote = buildCompatibilityNote({
    toolExecutionMode: args.executionPolicy.toolExecutionMode,
    requestedToolCount: args.requestedToolCount,
  });

  const query = extractFirstUserQuery(args.state.messages);
  const contextParts = await args.contextBuilder.buildContext(query, {
    includeMemory: true,
    includeSkills: true,
    includeMemorySearch: false,
  });
  const contextSection = contextParts.length > 0 ? `\n\n${contextParts.join("\n\n")}` : "";
  const instructionsWithDateTime = `Current date and time: ${currentDateTime}\n\n${args.agentInstructions}${compatibilityNote}${contextSection}`;

  const compactionConfig = getCompactionConfig();
  const budget = resolveModelContextBudget(
    args.provider,
    args.modelId,
    {
      auto: compactionConfig.auto,
      prune: compactionConfig.prune,
      reservedTokens: compactionConfig.reservedTokens,
    },
    args.modelLimits,
    args.modelLimitSource,
  );

  const operationalPromptSource = args.state.getOperationalMessages();
  const sanitizedPromptSource = sanitizeMessagesForPrompt(operationalPromptSource);
  const trimmedPrompt = trimMessagesForPrompt(sanitizedPromptSource, MINIMUM_RECENT_MESSAGES);
  const promptMessages = trimmedPrompt.messages;

  const overflowCheck = checkOverflow({
    estimatedTokens: estimatePromptTokens({
      messages: promptMessages,
      instructions: instructionsWithDateTime,
      tools: args.tools,
    }),
    budget,
  });

  const assessment = assessCompactionNeed({
    state: args.state,
    promptMessages,
    operationalPromptSource,
    instructions: instructionsWithDateTime,
    tools: args.tools,
    budget,
    overflowCheck,
    compactionConfig,
  });

  return {
    instructionsWithDateTime,
    promptMessages,
    operationalPromptSource,
    safeRecentMessages: buildSafeRecentMessages(promptMessages, MINIMUM_RECENT_MESSAGES),
    budget,
    compactionConfig,
    overflowCheck,
    assessment,
    estimatedPromptTokens: assessment.estimatedPromptTokens,
    sanitizedPromptSourceCount: sanitizedPromptSource.length,
    trimmedPromptSourceCount: promptMessages.length,
    droppedMessages: trimmedPrompt.droppedMessages,
    downgradedMessages: trimmedPrompt.downgradedMessages,
  };
}
