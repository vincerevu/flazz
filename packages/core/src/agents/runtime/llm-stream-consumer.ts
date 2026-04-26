import { AssistantMessage, RunEvent } from "@flazz/shared";
import { z } from "zod";
import { Agent } from "@flazz/shared";
import {
  StreamStepMessageBuilder,
  normalizeAssistantMessage,
  appendLengthStopNotice,
  hasVisibleAssistantOutput,
  streamLlm,
} from "./stream-pipeline.js";
import {
  EMPTY_ASSISTANT_FALLBACK_TEXT,
  RATE_LIMIT_ASSISTANT_FALLBACK_TEXT,
} from "./prompt-sanitizer.js";
import { createUsageUpdateEvent } from "./runtime-events.js";

type FinishReason = "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other" | "unknown" | null;

function isRateLimitError(error: string | null | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return normalized.includes("rate limit")
    || normalized.includes("quota")
    || normalized.includes("free-models-per-day")
    || normalized.includes("statuscode: 429")
    || normalized.includes("code\":429")
    || normalized.includes(" x-ratelimit-remaining")
    || normalized.includes("too many requests");
}

function buildEmptyAssistantFallback(text: string = EMPTY_ASSISTANT_FALLBACK_TEXT): z.infer<typeof AssistantMessage> {
  return {
    role: "assistant",
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export async function* consumeLlmStream(args: {
  runId: string;
  model: unknown;
  modelMessages: unknown[];
  instructionsWithDateTime: string;
  tools: Record<string, unknown>;
  signal?: AbortSignal;
  messageBuilder: StreamStepMessageBuilder;
  processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
  emitLog: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;
}): AsyncGenerator<z.infer<typeof RunEvent>, { streamError: string | null; lastFinishReason: FinishReason }, unknown> {
  let streamError: string | null = null;
  let lastFinishReason: FinishReason = null;

  for await (const event of streamLlm(
    args.model as never,
    args.modelMessages as never,
    args.instructionsWithDateTime,
    args.tools as never,
    args.signal,
  )) {
    if (!event || typeof event !== "object" || typeof (event as { type?: unknown }).type !== "string") {
      args.emitLog("warn", "invalid llm stream event yielded; skipping", { event });
      continue;
    }
    args.messageBuilder.ingest(event);
    for await (const runEvent of args.processEvent({
      runId: args.runId,
      type: "llm-stream-event",
      event,
      subflow: [],
    })) {
      yield runEvent;
    }
    if (event.type === "finish-step") {
      const usage = event.usage as Record<string, number> | undefined;
      if (usage) {
        for await (const runEvent of args.processEvent(createUsageUpdateEvent({
          runId: args.runId,
          usage: event.usage,
          finishReason: event.finishReason,
        }))) {
          yield runEvent;
        }
      }
    } else if (event.type === "finish") {
      const finishEvent = event as { usage?: Record<string, number>; totalUsage?: Record<string, number> };
      const usageInfo: Record<string, number> | undefined = finishEvent.usage ?? finishEvent.totalUsage;
      if (usageInfo) {
        for await (const runEvent of args.processEvent(createUsageUpdateEvent({
          runId: args.runId,
          usage: usageInfo,
          finishReason: event.finishReason,
        }))) {
          yield runEvent;
        }
      }
    }
    if (event.type === "error") {
      streamError = event.error;
      args.emitLog("error", "provider error", { error: streamError });
      for await (const runEvent of args.processEvent({
        runId: args.runId,
        type: "error",
        error: streamError,
        subflow: [],
      })) {
        yield runEvent;
      }
      break;
    }
    if (event.type === "finish-step" || event.type === "finish") {
      lastFinishReason = event.finishReason;
    }
  }

  return { streamError, lastFinishReason };
}

export async function finalizeAssistantMessage(args: {
  messageBuilder: StreamStepMessageBuilder;
  agent: z.infer<typeof Agent>;
  idGenerator: { next(): Promise<string> };
  allowTextToolFallback: boolean;
  lastFinishReason: FinishReason;
  streamError: string | null;
  emitLog: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;
  stateMessageCount: number;
}): Promise<z.infer<typeof AssistantMessage>> {
  let message = await normalizeAssistantMessage({
    message: args.messageBuilder.get(),
    agent: args.agent,
    idGenerator: args.idGenerator as never,
    allowTextToolFallback: args.allowTextToolFallback,
  });

  if (args.lastFinishReason === "length" && !hasVisibleAssistantOutput(message)) {
    message = appendLengthStopNotice(message);
  }
  if (!hasVisibleAssistantOutput(message)) {
    const rateLimited = isRateLimitError(args.streamError);
    args.emitLog("warn", "provider returned no visible assistant output", {
      finishReason: args.lastFinishReason,
      messages: args.stateMessageCount,
      rateLimited,
    });
    message = buildEmptyAssistantFallback(
      rateLimited ? RATE_LIMIT_ASSISTANT_FALLBACK_TEXT : EMPTY_ASSISTANT_FALLBACK_TEXT,
    );
  }

  return message;
}
