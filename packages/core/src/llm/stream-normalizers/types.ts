import { z } from "zod";

/**
 * Internal normalized stream event types used by the normalizer
 * before events are emitted to the runtime
 */

export const NormalizedStreamEvent = z.union([
    z.object({
        type: z.literal("tool-input-start"),
        toolCallId: z.string(),
        toolName: z.string(),
    }),
    z.object({
        type: z.literal("tool-input-delta"),
        toolCallId: z.string(),
        delta: z.string(),
    }),
    z.object({
        type: z.literal("tool-input-end"),
        toolCallId: z.string(),
    }),
    z.object({
        type: z.literal("tool-call-ready"),
        toolCallId: z.string(),
        toolName: z.string(),
        input: z.any(),
    }),
]);

export type NormalizedStreamEvent = z.infer<typeof NormalizedStreamEvent>;

/**
 * Accumulator state for tool arguments being streamed
 */
export interface ToolArgumentAccumulator {
    toolCallId: string;
    toolName: string;
    argumentBuffer: string;
    isValid: boolean;
}

/**
 * Finish reason mapping from provider to normalized form
 */
export const FinishReasonMap = {
    "function_call": "tool-calls",
    "tool_calls": "tool-calls",
    "stop": "stop",
    "length": "length",
    "content_filter": "content-filter",
    "error": "error",
} as const;

export type ProviderFinishReason = keyof typeof FinishReasonMap;
export type NormalizedFinishReason = typeof FinishReasonMap[ProviderFinishReason];
