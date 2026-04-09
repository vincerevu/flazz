import { LlmStepStreamEvent } from "@flazz/shared";
import { z } from "zod";
import { ToolArgumentAccumulator } from "./types.js";
import { mapFinishReason } from "./finish-reason-mapper.js";

/**
 * Normalizes OpenAI-compatible provider streams
 * 
 * Key responsibilities:
 * - Accumulates tool argument deltas before emitting tool-call
 * - Emits tool-input-start/delta/end events
 * - Maps finish reasons consistently
 * - Validates JSON before emitting tool-call
 */
export class OpenAICompatibleStreamNormalizer {
    private toolAccumulators: Map<string, ToolArgumentAccumulator> = new Map();

    /**
     * Process a raw provider chunk and emit normalized events
     */
    async *normalizeChunk(
        chunk: unknown
    ): AsyncGenerator<z.infer<typeof LlmStepStreamEvent>> {
        if (!chunk || typeof chunk !== "object") {
            return;
        }

        const obj = chunk as Record<string, unknown>;
        const choices = obj.choices as Array<Record<string, unknown>> | undefined;

        if (!Array.isArray(choices) || choices.length === 0) {
            return;
        }

        const choice = choices[0];
        const delta = choice.delta as Record<string, unknown> | undefined;

        if (!delta) {
            return;
        }

        // Handle reasoning content
        if (delta.reasoning) {
            yield {
                type: "reasoning-delta",
                delta: String(delta.reasoning),
            };
        }

        // Handle text content
        if (delta.content) {
            yield {
                type: "text-delta",
                delta: String(delta.content),
            };
        }

        // Handle tool calls
        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(toolCalls)) {
            for (const toolCall of toolCalls) {
                yield* this.processToolCall(toolCall);
            }
        }

        // Handle finish reason
        const finishReason = choice.finish_reason as string | undefined;
        if (finishReason) {
            const normalizedReason = mapFinishReason(finishReason);
            yield {
                type: "finish-step",
                finishReason: normalizedReason,
                usage: {
                    inputTokens: (obj.usage as Record<string, unknown>)?.prompt_tokens as number | undefined,
                    outputTokens: (obj.usage as Record<string, unknown>)?.completion_tokens as number | undefined,
                    totalTokens: (obj.usage as Record<string, unknown>)?.total_tokens as number | undefined,
                },
            };
        }
    }

    /**
     * Process a tool call chunk and emit normalized events
     */
    private async *processToolCall(
        toolCall: Record<string, unknown>
    ): AsyncGenerator<z.infer<typeof LlmStepStreamEvent>> {
        const id = toolCall.id as string | undefined;
        const function_ = toolCall.function as Record<string, unknown> | undefined;

        if (!id || !function_) {
            return;
        }

        const toolName = function_.name as string | undefined;
        const argumentsStr = function_.arguments as string | undefined;

        if (!toolName) {
            return;
        }

        // Get or create accumulator
        let accumulator = this.toolAccumulators.get(id);
        if (!accumulator) {
            accumulator = {
                toolCallId: id,
                toolName,
                argumentBuffer: "",
                isValid: false,
            };
            this.toolAccumulators.set(id, accumulator);

            // Emit tool-input-start
            yield {
                type: "tool-input-start",
                toolCallId: id,
                toolName,
            };
        }

        // Accumulate arguments
        if (argumentsStr) {
            accumulator.argumentBuffer += argumentsStr;

            // Emit tool-input-delta
            yield {
                type: "tool-input-delta",
                toolCallId: id,
                delta: argumentsStr,
            };

            // Try to validate JSON
            try {
                JSON.parse(accumulator.argumentBuffer);
                accumulator.isValid = true;
            } catch {
                // Not valid yet, will try again on next delta
            }
        }

        // If we have a complete tool call with valid JSON, emit tool-call
        if (accumulator.isValid && argumentsStr === undefined) {
            // This is the final chunk for this tool call
            yield {
                type: "tool-input-end",
                toolCallId: id,
            };

            try {
                const input = JSON.parse(accumulator.argumentBuffer);
                yield {
                    type: "tool-call",
                    toolCallId: id,
                    toolName,
                    input,
                };
            } catch {
                // If JSON parsing fails, emit with raw string
                yield {
                    type: "tool-call",
                    toolCallId: id,
                    toolName,
                    input: { raw: accumulator.argumentBuffer },
                };
            }

            // Clean up accumulator
            this.toolAccumulators.delete(id);
        }
    }

    /**
     * Flush any pending tool calls (for end of stream)
     */
    async *flush(): AsyncGenerator<z.infer<typeof LlmStepStreamEvent>> {
        for (const [id, accumulator] of this.toolAccumulators.entries()) {
            if (accumulator.argumentBuffer) {
                yield {
                    type: "tool-input-end",
                    toolCallId: id,
                };

                try {
                    const input = JSON.parse(accumulator.argumentBuffer);
                    yield {
                        type: "tool-call",
                        toolCallId: id,
                        toolName: accumulator.toolName,
                        input,
                    };
                } catch {
                    yield {
                        type: "tool-call",
                        toolCallId: id,
                        toolName: accumulator.toolName,
                        input: { raw: accumulator.argumentBuffer },
                    };
                }
            }
            this.toolAccumulators.delete(id);
        }
    }

    /**
     * Reset the normalizer state
     */
    reset(): void {
        this.toolAccumulators.clear();
    }
}
