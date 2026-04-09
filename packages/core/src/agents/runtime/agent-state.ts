import { z } from "zod";
import { Agent } from "@flazz/shared";
import { AssistantMessage, MessageList, ToolCallPart, ToolMessage } from "@flazz/shared";
import { AskHumanRequestEvent, RunEvent, ToolPermissionRequestEvent } from "@flazz/shared";
import { extractCommandNames } from "../../application/lib/command-executor.js";

export class AgentState {
    runId: string | null = null;
    agent: z.infer<typeof Agent> | null = null;
    agentName: string | null = null;
    messages: z.infer<typeof MessageList> = [];
    lastAssistantMsg: z.infer<typeof AssistantMessage> | null = null;
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
                // console.error('im here', this.agentName, this.runId, event.subflow);
                const ogEvent = this.pendingAskHumanRequests[event.toolCallId];
                this.messages.push({
                    role: "tool",
                    content: JSON.stringify({
                        userResponse: event.response,
                    }),
                    toolCallId: ogEvent.toolCallId,
                    toolName: this.toolCallIdMap[ogEvent.toolCallId]!.toolName,
                });
                delete this.pendingAskHumanRequests[ogEvent.toolCallId];
                break;
            }
        }
    }
}
