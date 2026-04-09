import { z } from "zod";
import { Agent } from "@flazz/shared/dist/agent.js";
import { AssistantMessage } from "@flazz/shared/dist/message.js";
import { RunEvent } from "@flazz/shared/dist/runs.js";
import { isBlocked } from "../../application/lib/command-executor.js";
import { AgentState } from "./agent-state.js";

// We define a minimal interface for the logger based on its usage in this file
interface LoopLogger {
    log(message?: unknown, ...optionalParams: unknown[]): void;
    error(message?: unknown, ...optionalParams: unknown[]): void;
}

export async function* handlePermissionAndHumanRequests({
    message,
    agent,
    state,
    runId,
    idGenerator,
    emitLog,
    processEvent,
    loopLogger,
}: {
    message: z.infer<typeof AssistantMessage>;
    agent: z.infer<typeof Agent>;
    state: AgentState;
    runId: string;
    idGenerator: { next: () => Promise<string> };
    emitLog: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;
    processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
    loopLogger: LoopLogger;
}): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
    if (message.content instanceof Array) {
        for (const part of message.content) {
            if (part.type === "tool-call") {
                const underlyingTool = agent.tools![part.toolName];
                if (underlyingTool.type === "builtin" && underlyingTool.name === "ask-human") {
                    loopLogger.log('emitting ask-human-request, toolCallId:', part.toolCallId);
                    yield* processEvent({
                        runId,
                        type: "ask-human-request",
                        toolCallId: part.toolCallId,
                        query: part.arguments.question,
                        subflow: [],
                    });
                }
                if (underlyingTool.type === "builtin" && underlyingTool.name === "executeCommand") {
                    // if command is blocked, then seek permission
                    if (isBlocked(part.arguments.command, state.sessionAllowedCommands)) {
                        loopLogger.log('emitting tool-permission-request, toolCallId:', part.toolCallId);
                        emitLog("info", "permission request", { toolCallId: part.toolCallId, command: part.arguments.command });
                        yield* processEvent({
                            runId,
                            type: "tool-permission-request",
                            toolCall: part,
                            subflow: [],
                        });
                    }
                }
                if (underlyingTool.type === "agent" && underlyingTool.name) {
                    loopLogger.log('emitting spawn-subflow, toolCallId:', part.toolCallId);
                    yield* processEvent({
                        runId,
                        type: "spawn-subflow",
                        agentName: underlyingTool.name,
                        toolCallId: part.toolCallId,
                        subflow: [],
                    });
                    yield* processEvent({
                        runId,
                        messageId: await idGenerator.next(),
                        type: "message",
                        message: {
                            role: "user",
                            content: part.arguments.message,
                        },
                        subflow: [part.toolCallId],
                    });
                }
            }
        }
    }
}
