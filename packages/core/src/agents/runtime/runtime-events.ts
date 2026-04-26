import { Message, RunEvent } from "@flazz/shared";
import { z } from "zod";

export type RuntimeStatusPhase =
  | "checking"
  | "running-tool"
  | "preparing-context"
  | "checking-context"
  | "compacting-context"
  | "waiting-for-model"
  | "processing-response"
  | "finalizing";

export function createRunStatusEvent(args: {
  runId: string;
  phase: RuntimeStatusPhase;
  message: string;
  toolName?: string;
  contextDebug?: {
    providerFlavor: string;
    modelId: string;
    contextLimit: number;
    usableInputBudget: number;
    outputReserve: number;
    compactionThreshold: number;
    targetThreshold: number;
    estimatedPromptTokens: number;
    overflowSource: "estimated" | "actual" | "none";
    budgetSource: "config" | "registry" | "fallback" | "unknown";
  };
}): z.infer<typeof RunEvent> {
  return RunEvent.parse({
    runId: args.runId,
    type: "run-status",
    phase: args.phase,
    message: args.message,
    toolName: args.toolName,
    contextDebug: args.contextDebug,
    subflow: [],
    ts: new Date().toISOString(),
  });
}

export function createUsageUpdateEvent(args: {
  runId: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  };
  finishReason?: "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other" | "unknown";
}): z.infer<typeof RunEvent> {
  return RunEvent.parse({
    runId: args.runId,
    type: "usage-update",
    usage: args.usage,
    finishReason: args.finishReason,
    subflow: [],
    ts: new Date().toISOString(),
  });
}

export function createMessageEvent(args: {
  runId: string;
  messageId: string;
  message: z.infer<typeof Message>;
}): z.infer<typeof RunEvent> {
  return RunEvent.parse({
    runId: args.runId,
    type: "message",
    messageId: args.messageId,
    message: args.message,
    subflow: [],
  });
}
