import { Agent, RunEvent, ToolCallPart } from "@flazz/shared";
import { z } from "zod";
import { PrefixLogger } from "@flazz/shared";
import { AgentState } from "./agent-state.js";
import { createMessageEvent } from "./runtime-events.js";
import { executeToolOrchestrator } from "./tool-orchestrator.js";
import { handleSubflowDelegation } from "./subflow-orchestrator.js";
import { IMessageQueue } from "../../application/lib/message-queue.js";
import { IModelConfigRepo } from "../../models/repo.js";
import { IModelCapabilityRepo } from "../../models/capability-repo.js";
import { IAbortRegistry } from "../../runs/abort-registry.js";

export async function* executePendingToolCalls(args: {
  state: AgentState;
  agent: z.infer<typeof Agent>;
  runId: string;
  signal: AbortSignal;
  abortRegistry: IAbortRegistry;
  emitLog: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;
  processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
  emitStatus: (
    phase: "checking" | "running-tool" | "preparing-context" | "checking-context" | "compacting-context" | "waiting-for-model" | "processing-response" | "finalizing",
    message: string,
    toolName?: string,
  ) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
  idGenerator: { next: () => Promise<string> };
  loopLogger: PrefixLogger;
  messageQueue: IMessageQueue;
  modelConfigRepo: IModelConfigRepo;
  modelCapabilityRepo: IModelCapabilityRepo;
  activeCorrelationId: string;
  streamAgentFn: (args: {
    state: AgentState;
    idGenerator: { next: () => Promise<string> };
    runId: string;
    messageQueue: IMessageQueue;
    modelConfigRepo: IModelConfigRepo;
    modelCapabilityRepo: IModelCapabilityRepo;
    signal: AbortSignal;
    abortRegistry: IAbortRegistry;
    correlationId: string;
  }) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
}): AsyncGenerator<z.infer<typeof RunEvent>, { aborted: boolean }, unknown> {
  for (const toolCallId of Object.keys(args.state.pendingToolCalls)) {
    const toolCall = args.state.toolCallIdMap[toolCallId] as z.infer<typeof ToolCallPart>;
    const logger = args.loopLogger.child(`tc-${toolCallId}-${toolCall.toolName}`);
    logger.log("processing");

    if (toolCall.toolName === "ask-human") {
      logger.log("skipping, reason: ask-human");
      continue;
    }

    if (args.state.deniedToolCallIds[toolCallId]) {
      logger.log("returning denied tool message, reason: tool has been denied");
      yield* args.processEvent(createMessageEvent({
        runId: args.runId,
        messageId: await args.idGenerator.next(),
        message: {
          role: "tool",
          content: "Unable to execute this tool: Permission was denied.",
          toolCallId,
          toolName: toolCall.toolName,
        },
      }));
      continue;
    }

    if (args.state.pendingToolPermissionRequests[toolCallId]) {
      logger.log("skipping, reason: permission is pending");
      continue;
    }

    if (args.signal.aborted) {
      logger.log("skipping, reason: aborted");
      return { aborted: true };
    }

    logger.log("executing tool");
    yield* args.emitStatus("running-tool", `Running ${toolCall.toolName}...`, toolCall.toolName);

    if (args.agent.tools?.[toolCall.toolName]?.type === "agent") {
      const subflowState = args.state.subflowStates[toolCallId];
      yield* handleSubflowDelegation({
        toolCall,
        toolCallId,
        subflowState,
        runId: args.runId,
        signal: args.signal,
        abortRegistry: args.abortRegistry,
        emitLog: args.emitLog,
        processEvent: args.processEvent,
        idGenerator: args.idGenerator,
        streamAgentFn: args.streamAgentFn,
        messageQueue: args.messageQueue,
        modelConfigRepo: args.modelConfigRepo,
        modelCapabilityRepo: args.modelCapabilityRepo,
        activeCorrelationId: args.activeCorrelationId,
      });
      continue;
    }

    yield* executeToolOrchestrator({
      toolCall,
      toolCallId,
      agent: args.agent,
      runId: args.runId,
      signal: args.signal,
      abortRegistry: args.abortRegistry as never,
      emitLog: args.emitLog,
      processEvent: args.processEvent,
      idGenerator: args.idGenerator,
    });
  }

  return { aborted: false };
}
