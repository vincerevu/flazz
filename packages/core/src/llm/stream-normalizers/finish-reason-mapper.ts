import { FinishReasonMap, ProviderFinishReason } from "./types.js";

/**
 * Maps provider-specific finish reasons to normalized finish reasons
 * Handles variations across different LLM providers
 */
export function mapFinishReason(
    providerReason: string | undefined
): "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other" | "unknown" {
    if (!providerReason) {
        return "unknown";
    }

    // Try direct mapping first
    const mapped = FinishReasonMap[providerReason as ProviderFinishReason];
    if (mapped) {
        return mapped;
    }

    // Handle common variations
    const normalized = providerReason.toLowerCase().replace(/_/g, "-");

    switch (normalized) {
        case "function-call":
        case "tool-call":
        case "tool-calls":
            return "tool-calls";
        case "stop":
            return "stop";
        case "length":
        case "max-tokens":
        case "max-completion-tokens":
            return "length";
        case "content-filter":
        case "content_filter":
            return "content-filter";
        case "error":
            return "error";
        default:
            return "unknown";
    }
}

/**
 * Checks if a finish reason indicates tool calls should be processed
 */
export function isToolCallFinishReason(reason: string | null): boolean {
    return reason === "tool-calls";
}

/**
 * Checks if a finish reason indicates the model stopped naturally
 */
export function isStopFinishReason(reason: string | null): boolean {
    return reason === "stop";
}

/**
 * Checks if a finish reason indicates the model was cut off
 */
export function isLengthFinishReason(reason: string | null): boolean {
    return reason === "length";
}

/**
 * Checks if a finish reason indicates an error occurred
 */
export function isErrorFinishReason(reason: string | null): boolean {
    return reason === "error";
}
