import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Agent } from "@flazz/shared/dist/agent.js";
import { ToolCallPart, ToolMessage } from "@flazz/shared/dist/message.js";
import { RunEvent } from "@flazz/shared/dist/runs.js";
import { AgentState } from "./agent-state.js";

export async function* handleSubflowDelegation({
    toolCall,
    toolCallId,
    subflowState,
    runId,
    signal,
    abortRegistry,
    emitLog,
    processEvent,
    idGenerator,
    streamAgentFn,
    messageQueue,
    modelConfigRepo,
    activeCorrelationId,
}: {
    toolCall: z.infer<typeof ToolCallPart>;
    toolCallId: string;
    subflowState: AgentState;
    runId: string;
    signal: AbortSignal;
    abortRegistry: unknown;
    emitLog: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;
    processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
    idGenerator: { next: () => Promise<string> };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    streamAgentFn: (args: any) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
    messageQueue: unknown;
    modelConfigRepo: unknown;
    activeCorrelationId: string;
}): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
    emitLog("info", "tool call start", { toolCallId, toolName: toolCall.toolName, arguments: toolCall.arguments });
    yield* processEvent({
        runId,
        type: "tool-invocation",
        toolCallId,
        toolName: toolCall.toolName,
        input: JSON.stringify(toolCall.arguments ?? {}),
        subflow: [],
    });

    let result: unknown = null;
    for await (const event of streamAgentFn({
        state: subflowState,
        idGenerator,
        runId,
        messageQueue,
        modelConfigRepo,
        signal,
        abortRegistry,
        correlationId: activeCorrelationId,
    })) {
        yield* processEvent({
            ...event,
            subflow: [toolCallId, ...event.subflow],
        });
    }

    if (!subflowState.getPendingAskHumans().length && !subflowState.getPendingPermissions().length) {
        result = subflowState.finalResponse();
    }

    const resultPayload = result === undefined ? null : result;
    emitLog("info", "tool call end", { toolCallId, toolName: toolCall.toolName, result: resultPayload });
    const resultMsg: z.infer<typeof ToolMessage> = {
        role: "tool",
        content: JSON.stringify(resultPayload),
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
    };
    yield* processEvent({
        runId,
        type: "tool-result",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: resultPayload,
        subflow: [],
    });
    yield* processEvent({
        runId,
        messageId: await idGenerator.next(),
        type: "message",
        message: resultMsg,
        subflow: [],
    });
}
