import { z } from "zod";
import { Agent } from "@flazz/shared";
import { AssistantMessage, MessageList, ToolCallPart, ToolMessage } from "@flazz/shared";
import { AskHumanRequestEvent, ToolPermissionRequestEvent } from "@flazz/shared";
import { RunEvent } from "@flazz/shared/dist/runs.js";
import { extractCommandNames } from "../../application/lib/command-executor.js";
import {
    buildCompactionReferenceMessage,
    deriveActiveTaskState,
    parseCarryover,
} from "./context-compaction.js";
import type { ActiveTaskState, StructuredCarryover } from "./context-compaction.js";

type CompactedOperationalBaseline = {
    summary: string;
    carryover: StructuredCarryover;
    taskState: ActiveTaskState;
    anchorHash: string;
    recentWindowStart: number;
    messageCountAtCompaction: number;
    estimatedTokensAfter: number;
    actualInputTokensAfter: number | null;
    protectedWindowReasons: string[];
    operationalMessageCountAfter: number;
    baselineMode: "full-history" | "summary-recent-window";
};

export class AgentState {
    runId: string | null = null;
    agent: z.infer<typeof Agent> | null = null;
    agentName: string | null = null;
    messages: z.infer<typeof MessageList> = [];
    lastAssistantMsg: z.infer<typeof AssistantMessage> | null = null;
    compactedContextSummary: string | null = null;
    compactedContextCarryover: StructuredCarryover | null = null;
    compactedTaskState: ActiveTaskState | null = null;
    compactedContextAnchorHash: string | null = null;
    compactedRecentWindowStart: number | null = null;
    lastCompactionMessageCount: number | null = null;
    lastCompactionEstimatedTokensAfter: number | null = null;
    lastCompactionActualInputTokensAfter: number | null = null;
    lastObservedInputTokens: number | null = null;
    awaitingCompactionActualUsage: boolean = false;
    compactedOperationalBaseline: CompactedOperationalBaseline | null = null;
    /**
     * Number of consecutive compaction failures. Reset to 0 on any successful
     * compaction. Used by the runtime circuit breaker to stop retrying when
     * compaction is persistently broken (e.g. network outage during summarise).
     */
    consecutiveCompactionFailures: number = 0;
    subflowStates: Record<string, AgentState> = {};
    toolCallIdMap: Record<string, z.infer<typeof ToolCallPart>> = {};
    pendingToolCalls: Record<string, true> = {};
    pendingToolPermissionRequests: Record<string, z.infer<typeof ToolPermissionRequestEvent>> = {};
    pendingAskHumanRequests: Record<string, z.infer<typeof AskHumanRequestEvent>> = {};
    allowedToolCallIds: Record<string, true> = {};
    deniedToolCallIds: Record<string, true> = {};
    sessionAllowedCommands: Set<string> = new Set();

    getPendingPermissions(): z.infer<typeof ToolPermissionRequestEvent>[] {
        const response: z.infer<typeof ToolPermissionRequestEvent>[] = [];
        for (const [id, subflowState] of Object.entries(this.subflowStates)) {
            for (const perm of subflowState.getPendingPermissions()) {
                response.push({
                    ...perm,
                    subflow: [id, ...perm.subflow],
                });
            }
        }
        for (const perm of Object.values(this.pendingToolPermissionRequests)) {
            response.push({
                ...perm,
                subflow: [],
            });
        }
        return response;
    }

    getPendingAskHumans(): z.infer<typeof AskHumanRequestEvent>[] {
        const response: z.infer<typeof AskHumanRequestEvent>[] = [];
        for (const [id, subflowState] of Object.entries(this.subflowStates)) {
            for (const ask of subflowState.getPendingAskHumans()) {
                response.push({
                    ...ask,
                    subflow: [id, ...ask.subflow],
                });
            }
        }
        for (const ask of Object.values(this.pendingAskHumanRequests)) {
            response.push({
                ...ask,
                subflow: [],
            });
        }
        return response;
    }

    /**
     * Returns tool-result messages for all pending tool calls, marking them as aborted.
     * This is called when a run is stopped so the LLM knows what happened to its tool requests.
     */
    getAbortedToolResults(): z.infer<typeof ToolMessage>[] {
        const results: z.infer<typeof ToolMessage>[] = [];
        for (const toolCallId of Object.keys(this.pendingToolCalls)) {
            const toolCall = this.toolCallIdMap[toolCallId];
            if (toolCall) {
                results.push({
                    role: "tool",
                    content: JSON.stringify({ error: "Tool execution aborted" }),
                    toolCallId,
                    toolName: toolCall.toolName,
                });
            }
        }
        return results;
    }

    /**
     * Clear all pending state (permissions, ask-human, tool calls).
     * Used when a run is stopped.
     */
    clearAllPending(): void {
        this.pendingToolPermissionRequests = {};
        this.pendingAskHumanRequests = {};
        // Recursively clear subflows
        for (const subflow of Object.values(this.subflowStates)) {
            subflow.clearAllPending();
        }
    }

    finalResponse(): string {
        if (!this.lastAssistantMsg) {
            return '';
        }
        if (typeof this.lastAssistantMsg.content === "string") {
            return this.lastAssistantMsg.content;
        }
        return this.lastAssistantMsg.content.reduce((acc, part) => {
            if (part.type === "text") {
                return acc + part.text;
            }
            return acc;
        }, "");
    }

    getPendingToolCallIds(): string[] {
        const ids = new Set<string>();

        for (const id of Object.keys(this.pendingToolCalls)) {
            ids.add(id);
        }
        for (const permission of this.getPendingPermissions()) {
            ids.add(permission.toolCall.toolCallId);
        }
        for (const ask of this.getPendingAskHumans()) {
            ids.add(ask.toolCallId);
        }

        return Array.from(ids);
    }

    getOperationalMessages(): z.infer<typeof MessageList> {
        const baseline = this.compactedOperationalBaseline;
        if (!baseline) {
            return this.messages;
        }

        const carryover = baseline.carryover ?? parseCarryover(baseline.summary);
        const taskState = baseline.taskState ?? deriveActiveTaskState(carryover);
        const summaryMessage = buildCompactionReferenceMessage(
            baseline.summary,
            carryover,
            taskState,
        );
        const recentWindowStart = Math.max(0, baseline.recentWindowStart ?? this.messages.length);
        return [summaryMessage, ...this.messages.slice(recentWindowStart)];
    }

    ingest(event: z.infer<typeof RunEvent>) {
        if (event.subflow.length > 0) {
            const { subflow, ...rest } = event;
            if (!this.subflowStates[subflow[0]]) {
                this.subflowStates[subflow[0]] = new AgentState();
            }
            this.subflowStates[subflow[0]].ingest({
                ...rest,
                subflow: subflow.slice(1),
            });
            return;
        }
        switch (event.type) {
            case "start":
                this.runId = event.runId;
                this.agentName = event.agentName;
                break;
            case "spawn-subflow":
                // Seed the subflow state with its agent so downstream loadAgent works.
                if (!this.subflowStates[event.toolCallId]) {
                    this.subflowStates[event.toolCallId] = new AgentState();
                }
                this.subflowStates[event.toolCallId].agentName = event.agentName;
                break;
            case "message":
                this.messages.push(event.message);
                if (event.message.content instanceof Array) {
                    for (const part of event.message.content) {
                        if (part.type === "tool-call") {
                            this.toolCallIdMap[part.toolCallId] = part;
                            this.pendingToolCalls[part.toolCallId] = true;
                        }
                    }
                }
                if (event.message.role === "tool") {
                    const message = event.message as z.infer<typeof ToolMessage>;
                    delete this.pendingToolCalls[message.toolCallId];
                }
                if (event.message.role === "assistant") {
                    this.lastAssistantMsg = event.message;
                }
                break;
            case "tool-permission-request":
                this.pendingToolPermissionRequests[event.toolCall.toolCallId] = event;
                break;
            case "tool-permission-response":
                switch (event.response) {
                    case "approve":
                        this.allowedToolCallIds[event.toolCallId] = true;
                        // For session scope, extract command names and add to session allowlist
                        if (event.scope === "session") {
                            const toolCall = this.toolCallIdMap[event.toolCallId];
                            if (toolCall && typeof toolCall.arguments === 'object' && toolCall.arguments !== null && 'command' in toolCall.arguments) {
                                const names = extractCommandNames(String(toolCall.arguments.command));
                                for (const name of names) {
                                    this.sessionAllowedCommands.add(name);
                                }
                            }
                        }
                        break;
                    case "deny":
                        this.deniedToolCallIds[event.toolCallId] = true;
                        break;
                }
                delete this.pendingToolPermissionRequests[event.toolCallId];
                break;
            case "ask-human-request":
                this.pendingAskHumanRequests[event.toolCallId] = event;
                break;
            case "ask-human-response": {
                const ogEvent = this.pendingAskHumanRequests[event.toolCallId];
                const toolCallId = ogEvent?.toolCallId ?? event.toolCallId;
                const toolName = this.toolCallIdMap[toolCallId]?.toolName;
                if (!toolName) {
                    delete this.pendingAskHumanRequests[event.toolCallId];
                    break;
                }
                this.messages.push({
                    role: "tool",
                    content: JSON.stringify({
                        userResponse: event.response,
                    }),
                    toolCallId,
                    toolName,
                });
                delete this.pendingAskHumanRequests[event.toolCallId];
                break;
            }
            case "context-compaction-complete":
                {
                const compactionEvent = event as typeof event & {
                    recentWindowStart?: number;
                    protectedWindowReasons?: string[];
                    operationalMessageCountAfter?: number;
                    baselineMode?: "full-history" | "summary-recent-window";
                };
                this.compactedContextSummary = event.summary;
                this.compactedContextCarryover = parseCarryover(event.summary);
                this.compactedTaskState = deriveActiveTaskState(this.compactedContextCarryover);
                this.compactedContextAnchorHash = event.anchorHash;
                this.compactedRecentWindowStart = compactionEvent.recentWindowStart ?? Math.max(0, this.messages.length - event.recentMessages);
                this.lastCompactionMessageCount = this.messages.length;
                this.lastCompactionEstimatedTokensAfter = event.estimatedTokensAfter;
                this.lastCompactionActualInputTokensAfter = null;
                this.awaitingCompactionActualUsage = true;
                this.compactedOperationalBaseline = {
                    summary: event.summary,
                    carryover: this.compactedContextCarryover,
                    taskState: this.compactedTaskState,
                    anchorHash: event.anchorHash,
                    recentWindowStart: this.compactedRecentWindowStart ?? 0,
                    messageCountAtCompaction: this.messages.length,
                    estimatedTokensAfter: event.estimatedTokensAfter,
                    actualInputTokensAfter: null,
                    protectedWindowReasons: compactionEvent.protectedWindowReasons ?? [],
                    operationalMessageCountAfter: compactionEvent.operationalMessageCountAfter ?? event.messageCountAfter,
                    baselineMode: compactionEvent.baselineMode ?? "summary-recent-window",
                };
                this.consecutiveCompactionFailures = 0;
                break;
                }
            case "context-compaction-failed":
                this.consecutiveCompactionFailures += 1;
                break;
            case "usage-update": {
                const hasPartialUsage = event.usage.inputTokens != null
                    || event.usage.outputTokens != null
                    || event.usage.cachedInputTokens != null;
                const observedInputTokens = event.usage.totalTokens != null
                    ? event.usage.totalTokens
                    : hasPartialUsage
                        ? (event.usage.inputTokens ?? 0)
                            + (event.usage.outputTokens ?? 0)
                            + (event.usage.cachedInputTokens ?? 0)
                        : null;
                this.lastObservedInputTokens = observedInputTokens;
                if (this.awaitingCompactionActualUsage && observedInputTokens != null) {
                    this.lastCompactionActualInputTokensAfter = observedInputTokens;
                    if (this.compactedOperationalBaseline) {
                        this.compactedOperationalBaseline.actualInputTokensAfter = observedInputTokens;
                    }
                    this.awaitingCompactionActualUsage = false;
                }
                break;
            }
        }
    }
}
