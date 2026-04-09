import { z } from "zod";
import { ProviderOptions } from "./message.js";

const BaseEvent = z.object({
    providerOptions: ProviderOptions.optional(),
})

export const LlmStepStreamReasoningStartEvent = BaseEvent.extend({
    type: z.literal("reasoning-start"),
});

export const LlmStepStreamReasoningDeltaEvent = BaseEvent.extend({
    type: z.literal("reasoning-delta"),
    delta: z.string(),
});

export const LlmStepStreamReasoningEndEvent = BaseEvent.extend({
    type: z.literal("reasoning-end"),
});

export const LlmStepStreamTextStartEvent = BaseEvent.extend({
    type: z.literal("text-start"),
});

export const LlmStepStreamTextDeltaEvent = BaseEvent.extend({
    type: z.literal("text-delta"),
    delta: z.string(),
});

export const LlmStepStreamTextEndEvent = BaseEvent.extend({
    type: z.literal("text-end"),
});

export const LlmStepStreamToolInputStartEvent = BaseEvent.extend({
    type: z.literal("tool-input-start"),
    toolCallId: z.string(),
    toolName: z.string(),
});

export const LlmStepStreamToolInputDeltaEvent = BaseEvent.extend({
    type: z.literal("tool-input-delta"),
    toolCallId: z.string(),
    delta: z.string(),
});

export const LlmStepStreamToolInputEndEvent = BaseEvent.extend({
    type: z.literal("tool-input-end"),
    toolCallId: z.string(),
});

export const LlmStepStreamToolCallEvent = BaseEvent.extend({
    type: z.literal("tool-call"),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.any(),
});

export const LlmStepStreamFinishStepEvent = z.object({
    type: z.literal("finish-step"),
    finishReason: z.enum(["stop", "tool-calls", "length", "content-filter", "error", "other", "unknown"]),
    usage: z.object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        totalTokens: z.number().optional(),
        reasoningTokens: z.number().optional(),
        cachedInputTokens: z.number().optional(),
    }),
    providerOptions: ProviderOptions.optional(),
});

export const LlmStepStreamFinishEvent = z.object({
    type: z.literal("finish"),
    finishReason: z.enum(["stop", "tool-calls", "length", "content-filter", "error", "other", "unknown"]),
    totalUsage: z.object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        totalTokens: z.number().optional(),
        reasoningTokens: z.number().optional(),
        cachedInputTokens: z.number().optional(),
    }).optional(),
    providerOptions: ProviderOptions.optional(),
});

export const LlmStepStreamErrorEvent = BaseEvent.extend({
    type: z.literal("error"),
    error: z.string(),
});

export const LlmStepStreamEvent = z.union([
    LlmStepStreamReasoningStartEvent,
    LlmStepStreamReasoningDeltaEvent,
    LlmStepStreamReasoningEndEvent,
    LlmStepStreamTextStartEvent,
    LlmStepStreamTextDeltaEvent,
    LlmStepStreamTextEndEvent,
    LlmStepStreamToolInputStartEvent,
    LlmStepStreamToolInputDeltaEvent,
    LlmStepStreamToolInputEndEvent,
    LlmStepStreamToolCallEvent,
    LlmStepStreamFinishStepEvent,
    LlmStepStreamFinishEvent,
    LlmStepStreamErrorEvent,
]);
