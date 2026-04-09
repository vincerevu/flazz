import { jsonSchema, ModelMessage } from "ai";
import { z } from "zod";
import { Agent } from "@flazz/shared/dist/agent.js";
import { AssistantContentPart, AssistantMessage, Message, MessageList, ProviderOptions, ToolCallPart } from "@flazz/shared/dist/message.js";
import { LlmStepStreamEvent } from "@flazz/shared/dist/llm-step-events.js";
import { IMonotonicallyIncreasingIdGenerator } from "../../application/lib/id-gen.js";
import { LanguageModel, stepCountIs, streamText, ToolSet } from "ai";

export class StreamStepMessageBuilder {
    private parts: z.infer<typeof AssistantContentPart>[] = [];
    private textBuffer: string = "";
    private reasoningBuffer: string = "";
    private providerOptions: z.infer<typeof ProviderOptions> | undefined = undefined;
    private reasoningProviderOptions: z.infer<typeof ProviderOptions> | undefined = undefined;
    private sanitizeTextArtifacts: boolean;

    constructor(options?: { sanitizeTextArtifacts?: boolean }) {
        this.sanitizeTextArtifacts = options?.sanitizeTextArtifacts ?? false;
    }

    flushBuffers() {
        if (this.reasoningBuffer || this.reasoningProviderOptions) {
            this.parts.push({ type: "reasoning", text: this.reasoningBuffer, providerOptions: this.reasoningProviderOptions });
            this.reasoningBuffer = "";
            this.reasoningProviderOptions = undefined;
        }
        if (this.textBuffer) {
            const nextText = this.sanitizeTextArtifacts
                ? sanitizeAssistantTextArtifacts(this.textBuffer)
                : this.textBuffer;
            if (nextText) {
                this.parts.push({ type: "text", text: nextText });
            }
            this.textBuffer = "";
        }
    }

    ingest(event: z.infer<typeof LlmStepStreamEvent>) {
        switch (event.type) {
            case "reasoning-start":
                break;
            case "reasoning-end":
                this.reasoningProviderOptions = event.providerOptions;
                this.flushBuffers();
                break;
            case "text-start":
            case "text-end":
                this.flushBuffers();
                break;
            case "reasoning-delta":
                this.reasoningBuffer += event.delta;
                break;
            case "text-delta":
                this.textBuffer += event.delta;
                break;
            case "tool-call":
                this.parts.push({
                    type: "tool-call",
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    arguments: event.input,
                    providerOptions: event.providerOptions,
                });
                break;
            case "finish-step":
            case "finish":
                this.providerOptions = event.providerOptions;
                break;
            case "error":
                this.flushBuffers();
                break;
        }
    }

    get(): z.infer<typeof AssistantMessage> {
        this.flushBuffers();
        return {
            role: "assistant",
            content: this.parts,
            providerOptions: this.providerOptions,
        };
    }
}

export function sanitizeAssistantTextArtifacts(text: string): string {
    let next = text;

    next = next
        .replace(/<\|tool_call_begin\|>/g, "")
        .replace(/<\|tool_call_end\|>/g, "")
        .replace(/<\|tool_calls_section_begin\|>/g, "")
        .replace(/<\|tool_calls_section_end\|>/g, "")
        .trim();

    const serializedTextMatchers = [
        /^\[\{\s*"type"\s*:\s*"text"\s*,\s*"text"\s*:\s*"([\s\S]*)"\s*\}\]\s*\}?$/s,
        /^\[\{\s*type\s*:\s*['"]text['"]\s*,\s*text\s*:\s*['"]([\s\S]*)['"]\s*\}\]\s*\}?$/s,
    ];

    for (const matcher of serializedTextMatchers) {
        const match = next.match(matcher);
        if (!match) continue;
        try {
            const quoted = `"${match[1]
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")}"`;
            return JSON.parse(quoted).trim();
        } catch {
            return match[1].replace(/\\n/g, "\n").replace(/\\'/g, "'").trim();
        }
    }

    return next;
}

export function collectTextualToolCalls(value: unknown): Array<{ toolName: string; input: unknown }> {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value.flatMap(collectTextualToolCalls);
    }

    if (typeof value !== "object") return [];
    const record = value as Record<string, unknown>;

    if (
        typeof record.toolName === "string"
        && record.input !== undefined
    ) {
        return [{ toolName: record.toolName, input: record.input }];
    }

    if (
        typeof record.name === "string"
        && (record.arguments !== undefined || record.input !== undefined)
    ) {
        return [{ toolName: record.name, input: record.arguments ?? record.input }];
    }

    if (Array.isArray(record.tool_calls)) {
        return collectTextualToolCalls(record.tool_calls);
    }

    if (Array.isArray(record.toolCalls)) {
        return collectTextualToolCalls(record.toolCalls);
    }

    if (Array.isArray(record.content)) {
        return collectTextualToolCalls(record.content);
    }

    if (record.type === "tool-call" || record.type === "tool_call") {
        const toolName = typeof record.toolName === "string"
            ? record.toolName
            : typeof record.name === "string"
                ? record.name
                : null;
        if (toolName) {
            return [{ toolName, input: record.input ?? record.arguments ?? {} }];
        }
    }

    return [];
}

export function tryParseTextualToolCalls(text: string): Array<{ toolName: string; input: unknown }> {
    const cleaned = sanitizeAssistantTextArtifacts(text);
    const candidates = new Set<string>([cleaned]);

    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) {
        candidates.add(fenced[1].trim());
    }

    const firstJsonLike = Math.min(
        ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((index) => index >= 0),
    );
    const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (Number.isFinite(firstJsonLike) && firstJsonLike >= 0 && lastBrace > firstJsonLike) {
        candidates.add(cleaned.slice(firstJsonLike, lastBrace + 1));
    }

    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            const parsed = JSON.parse(candidate);
            const toolCalls = collectTextualToolCalls(parsed);
            if (toolCalls.length > 0) {
                return toolCalls;
            }
        } catch {
            continue;
        }
    }

    return [];
}

export async function normalizeAssistantMessage({
    message,
    agent,
    idGenerator,
    allowTextToolFallback,
}: {
    message: z.infer<typeof AssistantMessage>;
    agent: z.infer<typeof Agent>;
    idGenerator: IMonotonicallyIncreasingIdGenerator;
    allowTextToolFallback: boolean;
}): Promise<z.infer<typeof AssistantMessage>> {
    if (!(message.content instanceof Array)) {
        return message;
    }

    const parts = message.content.map((part) => {
        if (part.type !== "text") return part;
        return {
            ...part,
            text: sanitizeAssistantTextArtifacts(part.text),
        };
    }).filter((part) => !(part.type === "text" && part.text.length === 0));

    if (!allowTextToolFallback || parts.some((part) => part.type === "tool-call")) {
        return {
            ...message,
            content: parts,
        };
    }

    const availableTools = new Set(Object.keys(agent.tools ?? {}));
    const textBlob = parts
        .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();

    const parsedToolCalls = tryParseTextualToolCalls(textBlob)
        .filter((toolCall) => availableTools.has(toolCall.toolName));

    if (parsedToolCalls.length === 0) {
        return {
            ...message,
            content: parts,
        };
    }

    const toolCallParts: z.infer<typeof ToolCallPart>[] = [];
    for (const toolCall of parsedToolCalls) {
        toolCallParts.push({
            type: "tool-call",
            toolCallId: await idGenerator.next(),
            toolName: toolCall.toolName,
            arguments: toolCall.input,
        });
    }

    return {
        ...message,
        content: [
            ...parts.filter((part) => part.type !== "text"),
            ...toolCallParts,
        ],
    };
}

export function hasVisibleAssistantOutput(message: z.infer<typeof AssistantMessage>) {
    if (typeof message.content === "string") {
        return message.content.trim().length > 0;
    }

    return message.content.some((part) => {
        if (part.type === "text" || part.type === "reasoning") {
            return part.text.trim().length > 0;
        }
        return true;
    });
}

export function appendLengthStopNotice(message: z.infer<typeof AssistantMessage>): z.infer<typeof AssistantMessage> {
    const warning = "The selected model stopped early because it hit the provider's output limit. Try a shorter prompt or a more tool-compatible model/provider.";

    if (typeof message.content === "string") {
        return {
            ...message,
            content: message.content.trim()
                ? `${message.content}\n\n${warning}`
                : warning,
        };
    }

    return {
        ...message,
        content: [
            ...message.content,
            {
                type: "text",
                text: warning,
            },
        ],
    };
}

export function formatLlmStreamError(rawError: unknown): string {
    let name: string | undefined;
    let responseBody: string | undefined;
    if (rawError && typeof rawError === "object") {
        const err = rawError as Record<string, unknown>;
        const nested = (err.error && typeof err.error === "object") ? err.error as Record<string, unknown> : null;
        const nameValue = err.name ?? nested?.name;
        const responseBodyValue = err.responseBody ?? nested?.responseBody;
        if (nameValue !== undefined) {
            name = String(nameValue);
        }
        if (responseBodyValue !== undefined) {
            responseBody = String(responseBodyValue);
        }
    } else if (typeof rawError === "string") {
        responseBody = rawError;
    }

    const lines: string[] = [];
    if (name) lines.push(`name: ${name}`);
    if (responseBody) lines.push(`responseBody: ${responseBody}`);
    return lines.length ? lines.join("\n") : "Model stream error";
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function convertFromMessages(messages: z.infer<typeof Message>[]): ModelMessage[] {
    const result: ModelMessage[] = [];
    for (const msg of messages) {
        const { providerOptions } = msg;
        switch (msg.role) {
            case "assistant":
                if (typeof msg.content === 'string') {
                    result.push({
                        role: "assistant",
                        content: msg.content,
                        providerOptions,
                    });
                } else {
                    result.push({
                        role: "assistant",
                        content: msg.content.map(part => {
                            switch (part.type) {
                                case 'text':
                                    return part;
                                case 'reasoning':
                                    return part;
                                case 'tool-call':
                                    return {
                                        type: 'tool-call',
                                        toolCallId: part.toolCallId,
                                        toolName: part.toolName,
                                        input: part.arguments,
                                        providerOptions: part.providerOptions,
                                    };
                            }
                        }),
                        providerOptions,
                    });
                }
                break;
            case "system":
                result.push({
                    role: "system",
                    content: msg.content,
                    providerOptions,
                });
                break;
            case "user":
                if (typeof msg.content === 'string') {
                    // Legacy string — pass through unchanged
                    result.push({
                        role: "user",
                        content: msg.content,
                        providerOptions,
                    });
                } else {
                    // New content parts array — collapse to text for LLM
                    const textSegments: string[] = [];
                    const attachmentLines: string[] = [];

                    for (const part of msg.content) {
                        if (part.type === "attachment") {
                            const sizeStr = part.size ? `, ${formatBytes(part.size)}` : '';
                            attachmentLines.push(`- ${part.filename} (${part.mimeType}${sizeStr}) at ${part.path}`);
                        } else {
                            textSegments.push(part.text);
                        }
                    }

                    if (attachmentLines.length > 0) {
                        textSegments.unshift("User has attached the following files:", ...attachmentLines, "");
                    }

                    result.push({
                        role: "user",
                        content: textSegments.join("\n"),
                        providerOptions,
                    });
                }
                break;
            case "tool":
                result.push({
                    role: "tool",
                    content: [
                        {
                            type: "tool-result",
                            toolCallId: msg.toolCallId,
                            toolName: msg.toolName,
                            output: {
                                type: "text",
                                value: msg.content,
                            },
                        },
                    ],
                    providerOptions,
                });
                break;
        }
    }
    // doing this because: https://github.com/OpenRouterTeam/ai-sdk-provider/issues/262
    return JSON.parse(JSON.stringify(result));
}

export async function* streamLlm(
    model: LanguageModel,
    messages: z.infer<typeof MessageList>,
    instructions: string,
    tools: ToolSet,
    signal?: AbortSignal,
): AsyncGenerator<z.infer<typeof LlmStepStreamEvent>, void, unknown> {
    const converted = convertFromMessages(messages);
    console.log(`! SENDING payload to model: `, JSON.stringify(converted))
    const { fullStream } = streamText({
        model,
        messages: converted,
        system: instructions,
        tools,
        stopWhen: stepCountIs(1),
        abortSignal: signal,
    });
    for await (const event of fullStream) {
        // Check abort on every chunk for responsiveness
        signal?.throwIfAborted();
        console.log("-> \t\tstream event", JSON.stringify(event));
        switch (event.type) {
            case "error":
                yield {
                    type: "error",
                    error: formatLlmStreamError((event as { error?: unknown }).error ?? event),
                };
                return;
            case "reasoning-start":
                yield {
                    type: "reasoning-start",
                    providerOptions: event.providerMetadata,
                };
                break;
            case "reasoning-delta":
                yield {
                    type: "reasoning-delta",
                    delta: event.text,
                    providerOptions: event.providerMetadata,
                };
                break;
            case "reasoning-end":
                yield {
                    type: "reasoning-end",
                    providerOptions: event.providerMetadata,
                };
                break;
            case "text-start":
                yield {
                    type: "text-start",
                    providerOptions: event.providerMetadata,
                };
                break;
            case "text-end":
                yield {
                    type: "text-end",
                    providerOptions: event.providerMetadata,
                };
                break;
            case "text-delta":
                yield {
                    type: "text-delta",
                    delta: event.text,
                    providerOptions: event.providerMetadata,
                };
                break;
            case "tool-call":
                yield {
                    type: "tool-call",
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    input: event.input,
                    providerOptions: event.providerMetadata,
                };
                break;
            case "finish-step":
                yield {
                    type: "finish-step",
                    usage: event.usage,
                    finishReason: event.finishReason,
                    providerOptions: event.providerMetadata,
                };
                break;
            case "finish":
                yield {
                    type: "finish",
                    finishReason: event.finishReason,
                    totalUsage: event.totalUsage,
                };
                break;
            default:
                console.log('unknown stream event:', JSON.stringify(event));
                continue;
        }
    }
}
