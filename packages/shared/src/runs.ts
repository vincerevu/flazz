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

const ContextBudgetSource = z.enum(["config", "registry", "fallback", "unknown"]);

export const RunStatusEvent = BaseRunEvent.extend({
    type: z.literal("run-status"),
    phase: z.enum([
        "checking",
        "running-tool",
        "preparing-context",
        "checking-context",
        "compacting-context",
        "waiting-for-model",
        "processing-response",
        "finalizing",
    ]),
    message: z.string(),
    toolName: z.string().optional(),
    contextDebug: z.object({
        providerFlavor: z.string(),
        modelId: z.string(),
        contextLimit: z.number().int().positive(),
        usableInputBudget: z.number().int().positive(),
        outputReserve: z.number().int().nonnegative(),
        compactionThreshold: z.number().int().positive(),
        targetThreshold: z.number().int().positive(),
        estimatedPromptTokens: z.number().int().nonnegative(),
        overflowSource: z.enum(["estimated", "actual", "none"]),
        budgetSource: ContextBudgetSource,
    }).optional(),
});

export const StartEvent = BaseRunEvent.extend({
    type: z.literal("start"),
    agentName: z.string(),
    runType: z.enum(["chat", "background"]).optional(),
});

export const RunType = z.enum(["chat", "background"]);

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
    baselineMode: z.enum(["full-history", "summary-recent-window"]).optional(),
    messageCountBefore: z.number().int().nonnegative(),
    operationalMessageCountBefore: z.number().int().nonnegative().optional(),
    estimatedTokensBefore: z.number().int().nonnegative(),
    messagesSinceLastCompaction: z.number().int().nonnegative().optional(),
    estimatedTokenGrowthSinceLastCompaction: z.number().int().nonnegative().optional(),
    actualTokenGrowthSinceLastCompaction: z.number().int().nonnegative().optional(),
    contextLimit: z.number().int().positive(),
    usableInputBudget: z.number().int().positive(),
    compactionThreshold: z.number().int().positive(),
    targetThreshold: z.number().int().positive(),
    contextBudgetSource: ContextBudgetSource.optional(),
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
    recentWindowStart: z.number().int().nonnegative().optional(),
    protectedWindowReasons: z.array(z.string()).optional(),
    operationalMessageCountAfter: z.number().int().nonnegative().optional(),
    baselineMode: z.enum(["full-history", "summary-recent-window"]).optional(),
    contextLimit: z.number().int().positive(),
    usableInputBudget: z.number().int().positive(),
    compactionThreshold: z.number().int().positive(),
    targetThreshold: z.number().int().positive(),
    contextBudgetSource: ContextBudgetSource.optional(),
    provenanceRefs: z.array(z.string()).optional(),
    reused: z.boolean().optional(),
});

export const ContextCompactionFailedEvent = BaseRunEvent.extend({
    type: z.literal("context-compaction-failed"),
    compactionId: z.string(),
    strategy: z.literal("summary-window"),
    escalated: z.boolean().optional(),
    error: z.string(),
    failureCategory: z.enum(["abort", "provider", "invalid-response", "parse", "other"]).optional(),
    baselineMode: z.enum(["full-history", "summary-recent-window"]).optional(),
    messageCountBefore: z.number().int().nonnegative(),
    operationalMessageCountBefore: z.number().int().nonnegative().optional(),
    estimatedTokensBefore: z.number().int().nonnegative(),
    messagesSinceLastCompaction: z.number().int().nonnegative().optional(),
    estimatedTokenGrowthSinceLastCompaction: z.number().int().nonnegative().optional(),
    actualTokenGrowthSinceLastCompaction: z.number().int().nonnegative().optional(),
    contextLimit: z.number().int().positive(),
    usableInputBudget: z.number().int().positive(),
    compactionThreshold: z.number().int().positive(),
    targetThreshold: z.number().int().positive(),
    contextBudgetSource: ContextBudgetSource.optional(),
});

/** Emitted when tool outputs are pruned before (or instead of) full compaction. */
export const ContextPrunedEvent = BaseRunEvent.extend({
    type: z.literal("context-pruned"),
    /** Number of tool result messages whose content was trimmed. */
    prunedCount: z.number().int().nonnegative(),
    /** Estimated tokens recovered. */
    tokensSaved: z.number().int().nonnegative(),
    /** Tokens remaining after prune (estimated). */
    estimatedTokensAfter: z.number().int().nonnegative(),
});

export const RunEvent = z.union([
    RunProcessingStartEvent,
    RunProcessingEndEvent,
    RunStatusEvent,
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
    ContextPrunedEvent,
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
    runType: RunType,
    log: z.array(RunEvent),
});

export const RunConversationMessage = z.object({
    id: z.string(),
    runId: z.string(),
    message: Message,
    createdAt: z.iso.datetime(),
});

export const RunConversation = Run.omit({ log: true }).extend({
    messages: z.array(RunConversationMessage),
    auxiliaryEvents: z.array(RunEvent),
});

export const ListRunsResponse = z.object({
    runs: z.array(Run.pick({
        id: true,
        title: true,
        createdAt: true,
        agentId: true,
        runType: true,
    })),
    nextCursor: z.string().optional(),
});

export const CreateRunOptions = Run.pick({
    agentId: true,
    runType: true,
});
