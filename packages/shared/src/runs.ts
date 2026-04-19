import { LlmStepStreamEvent } from "./llm-step-events.js";
import { Message, ToolCallPart } from "./message.js";
import z from "zod";

const BaseRunEvent = z.object({
    runId: z.string(),
    ts: z.iso.datetime().optional(),
    subflow: z.array(z.string()),
});

export const RunProcessingStartEvent = BaseRunEvent.extend({
    type: z.literal("run-processing-start"),
});

export const RunProcessingEndEvent = BaseRunEvent.extend({
    type: z.literal("run-processing-end"),
});

export const StartEvent = BaseRunEvent.extend({
    type: z.literal("start"),
    agentName: z.string(),
});

export const SpawnSubFlowEvent = BaseRunEvent.extend({
    type: z.literal("spawn-subflow"),
    agentName: z.string(),
    toolCallId: z.string(),
});

export const LlmStreamEvent = BaseRunEvent.extend({
    type: z.literal("llm-stream-event"),
    event: LlmStepStreamEvent,
});

export const UsageUpdateEvent = BaseRunEvent.extend({
    type: z.literal("usage-update"),
    usage: z.object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        totalTokens: z.number().optional(),
        reasoningTokens: z.number().optional(),
        cachedInputTokens: z.number().optional(),
    }),
    finishReason: z.enum(["stop", "tool-calls", "length", "content-filter", "error", "other", "unknown"]).optional(),
});

export const MessageEvent = BaseRunEvent.extend({
    type: z.literal("message"),
    messageId: z.string(),
    message: Message,
});

export const ToolInvocationEvent = BaseRunEvent.extend({
    type: z.literal("tool-invocation"),
    toolCallId: z.string().optional(),
    toolName: z.string(),
    input: z.string(),
});

export const ToolResultEvent = BaseRunEvent.extend({
    type: z.literal("tool-result"),
    toolCallId: z.string().optional(),
    toolName: z.string(),
    result: z.any(),
});

export const AskHumanRequestEvent = BaseRunEvent.extend({
    type: z.literal("ask-human-request"),
    toolCallId: z.string(),
    query: z.string(),
});

export const AskHumanResponseEvent = BaseRunEvent.extend({
    type: z.literal("ask-human-response"),
    toolCallId: z.string(),
    response: z.string(),
});

export const ToolPermissionRequestEvent = BaseRunEvent.extend({
    type: z.literal("tool-permission-request"),
    toolCall: ToolCallPart,
});

export const ToolPermissionResponseEvent = BaseRunEvent.extend({
    type: z.literal("tool-permission-response"),
    toolCallId: z.string(),
    response: z.enum(["approve", "deny"]),
    scope: z.enum(["once", "session", "always"]).optional(),
});

export const RunErrorEvent = BaseRunEvent.extend({
    type: z.literal("error"),
    error: z.string(),
});

export const RunStoppedEvent = BaseRunEvent.extend({
    type: z.literal("run-stopped"),
    reason: z.enum(["user-requested", "force-stopped"]).optional(),
});

export const ContextCompactionStartEvent = BaseRunEvent.extend({
    type: z.literal("context-compaction-start"),
    compactionId: z.string(),
    strategy: z.literal("summary-window"),
    escalated: z.boolean().optional(),
    messageCountBefore: z.number().int().nonnegative(),
    estimatedTokensBefore: z.number().int().nonnegative(),
    contextLimit: z.number().int().positive(),
    usableInputBudget: z.number().int().positive(),
    compactionThreshold: z.number().int().positive(),
    targetThreshold: z.number().int().positive(),
});

export const ContextCompactionCompleteEvent = BaseRunEvent.extend({
    type: z.literal("context-compaction-complete"),
    compactionId: z.string(),
    strategy: z.literal("summary-window"),
    escalated: z.boolean().optional(),
    summary: z.string(),
    anchorHash: z.string(),
    omittedMessages: z.number().int().nonnegative(),
    recentMessages: z.number().int().nonnegative(),
    messageCountBefore: z.number().int().nonnegative(),
    messageCountAfter: z.number().int().nonnegative(),
    estimatedTokensBefore: z.number().int().nonnegative(),
    estimatedTokensAfter: z.number().int().nonnegative(),
    tokensSaved: z.number().int().nonnegative(),
    reductionPercent: z.number().int().min(0).max(100),
    contextLimit: z.number().int().positive(),
    usableInputBudget: z.number().int().positive(),
    compactionThreshold: z.number().int().positive(),
    targetThreshold: z.number().int().positive(),
    provenanceRefs: z.array(z.string()).optional(),
    reused: z.boolean().optional(),
});

export const ContextCompactionFailedEvent = BaseRunEvent.extend({
    type: z.literal("context-compaction-failed"),
    compactionId: z.string(),
    strategy: z.literal("summary-window"),
    escalated: z.boolean().optional(),
    error: z.string(),
    messageCountBefore: z.number().int().nonnegative(),
    estimatedTokensBefore: z.number().int().nonnegative(),
    contextLimit: z.number().int().positive(),
    usableInputBudget: z.number().int().positive(),
    compactionThreshold: z.number().int().positive(),
    targetThreshold: z.number().int().positive(),
});

export const RunEvent = z.union([
    RunProcessingStartEvent,
    RunProcessingEndEvent,
    StartEvent,
    SpawnSubFlowEvent,
    LlmStreamEvent,
    UsageUpdateEvent,
    MessageEvent,
    ToolInvocationEvent,
    ToolResultEvent,
    AskHumanRequestEvent,
    AskHumanResponseEvent,
    ToolPermissionRequestEvent,
    ToolPermissionResponseEvent,
    RunErrorEvent,
    RunStoppedEvent,
    ContextCompactionStartEvent,
    ContextCompactionCompleteEvent,
    ContextCompactionFailedEvent,
]);

export const ToolPermissionAuthorizePayload = ToolPermissionResponseEvent.pick({
    subflow: true,
    toolCallId: true,
    response: true,
    scope: true,
});

export const AskHumanResponsePayload = AskHumanResponseEvent.pick({
    subflow: true,
    toolCallId: true,
    response: true,
});

export const Run = z.object({
    id: z.string(),
    title: z.string().optional(),
    createdAt: z.iso.datetime(),
    agentId: z.string(),
    log: z.array(RunEvent),
});

export const ListRunsResponse = z.object({
    runs: z.array(Run.pick({
        id: true,
        title: true,
        createdAt: true,
        agentId: true,
    })),
    nextCursor: z.string().optional(),
});

export const CreateRunOptions = Run.pick({
    agentId: true,
});
