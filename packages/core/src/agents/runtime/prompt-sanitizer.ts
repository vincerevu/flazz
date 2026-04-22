import { z } from "zod";
import { AssistantMessage, MessageList, ToolMessage } from "@flazz/shared";

export const EMPTY_ASSISTANT_FALLBACK_TEXT =
    "The selected model returned no visible output for the last step. Please retry or switch to a different model/provider.";

function getAssistantText(message: z.infer<typeof AssistantMessage>): string {
    if (typeof message.content === "string") {
        return message.content.trim();
    }

    return message.content
        .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
}

function isNoVisibleOutputFallback(message: z.infer<typeof AssistantMessage>): boolean {
    return getAssistantText(message) === EMPTY_ASSISTANT_FALLBACK_TEXT;
}

const PROVIDER_RUNTIME_NOISE_PATTERNS = [
    /\bAI_RetryError\b/i,
    /\bAI_APICallError\b/i,
    /\binvalid_request_error\b/i,
    /\bbad_request\b/i,
    /\bprovider returned no visible assistant output\b/i,
    /\bselected model returned no visible output\b/i,
    /\btool_use\.input\b/i,
    /\bInput should be a valid dictionary\b/i,
    /\bmessages\.\d+\.content\b/i,
    /\bresponseBody:/i,
    /\bAPICallError\b/i,
];

function isProviderRuntimeNoise(message: z.infer<typeof AssistantMessage>): boolean {
    const text = getAssistantText(message);
    return PROVIDER_RUNTIME_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function stringifyToolContent(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return "";

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object") {
            const record = parsed as Record<string, unknown>;
            const error = record.error ?? record.stderr ?? record.message;
            if (error !== undefined) {
                return String(error);
            }
            const exitCode = record.exitCode ?? record.code;
            if (exitCode !== undefined) {
                return `Tool returned exit code ${String(exitCode)}.`;
            }
        }
    } catch {
        // Keep non-JSON tool content as text below.
    }

    return trimmed;
}

function isProviderRuntimeToolNoise(text: string): boolean {
    return PROVIDER_RUNTIME_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeToolMessage(message: z.infer<typeof ToolMessage>): z.infer<typeof ToolMessage> | null {
    const text = stringifyToolContent(message.content);
    if (!text) {
        return message;
    }

    if (isProviderRuntimeToolNoise(text)) {
        return null;
    }

    const maxToolErrorLength = 900;
    if (text.length <= maxToolErrorLength) {
        return message;
    }

    return {
        ...message,
        content: `${text.slice(0, maxToolErrorLength).trim()}\n\n[Tool output truncated before sending to the model.]`,
    };
}

/**
 * Keeps UI/history fidelity while preventing transient provider failure text from
 * becoming model context on the next turn.
 */
export function sanitizeMessagesForPrompt(messages: z.infer<typeof MessageList>): z.infer<typeof MessageList> {
    const sanitized: z.infer<typeof MessageList> = [];
    const keptToolCallIds = new Set<string>();

    for (const message of messages) {
        if (message.role === "assistant") {
            if (isNoVisibleOutputFallback(message) || isProviderRuntimeNoise(message)) {
                continue;
            }

            sanitized.push(message);

            if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    if (part.type === "tool-call") {
                        keptToolCallIds.add(part.toolCallId);
                    }
                }
            }
            continue;
        }

        if (message.role === "tool" && !keptToolCallIds.has(message.toolCallId)) {
            continue;
        }

        if (message.role === "tool") {
            const sanitizedTool = sanitizeToolMessage(message);
            if (sanitizedTool) {
                sanitized.push(sanitizedTool);
            }
            continue;
        }

        sanitized.push(message);
    }

    return sanitized;
}
