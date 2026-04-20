import fs from "fs";
import path from "path";
import crypto from "crypto";
import { WorkDir } from "../config/config.js";
import { getNoteCreationStrictness } from "../config/note_creation_config.js";
import { Agent, AssistantMessage } from "@flazz/shared";
import { RunEvent } from "@flazz/shared/dist/runs.js";
import { CopilotAgent } from "../application/assistant/agent.js";
import container, { contextBuilder, runLearningService, runMemoryService } from "../di/container.js";
import { IModelConfigRepo } from "../models/repo.js";
import { createProvider } from "../models/models.js";
import { getModelExecutionPolicy } from "../models/provider-capabilities.js";
import { IAgentsRepo } from "./repo.js";
import { IMonotonicallyIncreasingIdGenerator } from "../application/lib/id-gen.js";
import { IBus } from "../application/lib/bus.js";
import { IMessageQueue } from "../application/lib/message-queue.js";
import { IRunsRepo } from "../runs/repo.js";
import { IRunsLock } from "../runs/lock.js";
import { IAbortRegistry } from "../runs/abort-registry.js";
import { PrefixLogger } from "@flazz/shared";
import { parse } from "yaml";
import { raw as noteCreationMediumRaw } from "../memory-graph/note-creation-medium.js";
import { raw as noteCreationLowRaw } from "../memory-graph/note-creation-low.js";
import { raw as noteCreationHighRaw } from "../memory-graph/note-creation-high.js";
import { getRaw as getNoteCreationRaw } from "../memory-graph/note-creation.js";
import { getRaw as getLabelingAgentRaw } from "../memory-graph/labeling-agent.js";
import { z } from "zod";

import {
    AgentState,
    StreamStepMessageBuilder,
    normalizeAssistantMessage,
    appendLengthStopNotice,
    hasVisibleAssistantOutput,
    streamLlm,
    buildTools,
    executeToolOrchestrator,
    handleSubflowDelegation,
    handlePermissionAndHumanRequests,
    trimMessagesForPrompt,
    deriveRunCompactionMetrics,
} from "./runtime/index.js";
import { buildSafeRecentMessages } from "./runtime/history-window.js";
import { prepareCompactedContext } from "./runtime/context-compaction.js";
import { estimatePromptTokens, resolveModelContextBudget } from "./runtime/model-context-budget.js";
import { checkOverflow } from "./runtime/overflow-detector.js";
import { pruneToolOutputs } from "./runtime/context-pruner.js";
import { buildAutoContinueMessage } from "./runtime/auto-continue.js";
import { isToolCallFinishReason } from "../llm/stream-normalizers/index.js";

export interface IAgentRuntime {
    trigger(runId: string): Promise<void>;
}

export class AgentRuntime implements IAgentRuntime {
    private runsRepo: IRunsRepo;
    private idGenerator: IMonotonicallyIncreasingIdGenerator;
    private bus: IBus;
    private messageQueue: IMessageQueue;
    private modelConfigRepo: IModelConfigRepo;
    private runsLock: IRunsLock;
    private abortRegistry: IAbortRegistry;

    constructor({
        runsRepo,
        idGenerator,
        bus,
        messageQueue,
        modelConfigRepo,
        runsLock,
        abortRegistry,
    }: {
        runsRepo: IRunsRepo;
        idGenerator: IMonotonicallyIncreasingIdGenerator;
        bus: IBus;
        messageQueue: IMessageQueue;
        modelConfigRepo: IModelConfigRepo;
        runsLock: IRunsLock;
        abortRegistry: IAbortRegistry;
    }) {
        this.runsRepo = runsRepo;
        this.idGenerator = idGenerator;
        this.bus = bus;
        this.messageQueue = messageQueue;
        this.modelConfigRepo = modelConfigRepo;
        this.runsLock = runsLock;
        this.abortRegistry = abortRegistry;
    }

    async trigger(runId: string): Promise<void> {
        if (!await this.runsLock.lock(runId)) {
            console.log(`unable to acquire lock on run ${runId}`);
            return;
        }
        const signal = this.abortRegistry.createForRun(runId);
        try {
            await this.bus.publish({
                runId,
                type: "run-processing-start",
                subflow: [],
            });
            while (true) {
                // Check for abort before each iteration
                if (signal.aborted) {
                    break;
                }

                let eventCount = 0;
                const run = await this.runsRepo.fetch(runId);
                if (!run) {
                    throw new Error(`Run ${runId} not found`);
                }
                const state = new AgentState();
                for (const event of run.log) {
                    state.ingest(event);
                }
                const correlationId = crypto.randomUUID();
                try {
                    console.log(JSON.stringify({
                        ts: new Date().toISOString(),
                        level: "info",
                        service: "agent-runtime",
                        runId,
                        correlationId,
                        message: "Run processing started",
                    }));
                    for await (const event of streamAgent({
                        state,
                        idGenerator: this.idGenerator,
                        runId,
                        messageQueue: this.messageQueue,
                        modelConfigRepo: this.modelConfigRepo,
                        signal,
                        abortRegistry: this.abortRegistry,
                        correlationId,
                    })) {
                        eventCount++;
                        if (event.type !== "llm-stream-event") {
                            await this.runsRepo.appendEvents(runId, [event]);
                        }
                        await this.bus.publish(event);
                    }
                } catch (error) {
                    if (error instanceof Error && error.name === "AbortError") {
                        // Abort detected — exit cleanly
                        break;
                    }
                    throw error;
                }

                // if no events, break
                if (!eventCount) {
                    break;
                }
            }

            // Emit run-stopped event if aborted
            if (signal.aborted) {
                const stoppedEvent: z.infer<typeof RunEvent> = {
                    runId,
                    type: "run-stopped",
                    reason: "user-requested",
                    subflow: [],
                };
                await this.runsRepo.appendEvents(runId, [stoppedEvent]);
                await this.bus.publish(stoppedEvent);
            }
        } finally {
            try {
                const completedRun = await this.runsRepo.fetch(runId);
                if (completedRun) {
                    const compactionMetrics = deriveRunCompactionMetrics(completedRun.log);
                    if (compactionMetrics.totalAttempts > 0) {
                        console.log(JSON.stringify({
                            ts: new Date().toISOString(),
                            level: "info",
                            service: "agent-runtime",
                            runId,
                            message: "context compaction summary",
                            ...compactionMetrics,
                        }));
                    }
                    runMemoryService.recordRun(completedRun);
                    if (!signal.aborted) {
                        await runLearningService.learnFromRun(completedRun);
                    }
                }
            } catch (error) {
                console.error(`[RunFinalization] Failed while finalizing run ${runId}:`, error);
            }
            this.abortRegistry.cleanup(runId);
            await this.runsLock.release(runId);
            await this.bus.publish({
                runId,
                type: "run-processing-end",
                subflow: [],
            });
        }
    }
}

export class RunLogger {
    private logFile: string;
    private fileHandle: fs.WriteStream;

    ensureRunsDir() {
        const runsDir = path.join(WorkDir, "runs");
        if (!fs.existsSync(runsDir)) {
            fs.mkdirSync(runsDir, { recursive: true });
        }
    }

    constructor(runId: string) {
        this.ensureRunsDir();
        this.logFile = path.join(WorkDir, "runs", `${runId}.jsonl`);
        this.fileHandle = fs.createWriteStream(this.logFile, {
            flags: "a",
            encoding: "utf8",
        });
    }

    log(event: z.infer<typeof RunEvent>) {
        if (event.type !== "llm-stream-event") {
            this.fileHandle.write(JSON.stringify(event) + "\n");
        }
    }

    close() {
        this.fileHandle.close();
    }
}

export async function loadAgent(id: string): Promise<z.infer<typeof Agent>> {
    if (id === "copilot" || id === "Flazz") {
        return CopilotAgent;
    }

    if (id === "labeling_agent") {
        const raw = getLabelingAgentRaw();
        let agent: z.infer<typeof Agent> = {
            name: id,
            instructions: raw,
        };

        if (raw.startsWith("---")) {
            const end = raw.indexOf("\n---", 3);
            if (end !== -1) {
                const fm = raw.slice(3, end).trim();
                const content = raw.slice(end + 4).trim();
                const yaml = parse(fm);
                const parsed = Agent.omit({ name: true, instructions: true }).parse(yaml);
                agent = {
                    ...agent,
                    ...parsed,
                    instructions: content,
                };
            }
        }

        return agent;
    }

    if (id === 'note_creation') {
        const strictness = getNoteCreationStrictness();
        let raw = getNoteCreationRaw();
        switch (strictness) {
            case 'medium':
                raw = getNoteCreationRaw() || noteCreationMediumRaw;
                break;
            case 'low':
                raw = getNoteCreationRaw() || noteCreationLowRaw;
                break;
            case 'high':
                raw = getNoteCreationRaw() || noteCreationHighRaw;
                break;
        }
        let agent: z.infer<typeof Agent> = {
            name: id,
            instructions: raw,
        };

        // Parse frontmatter if present
        if (raw.startsWith("---")) {
            const end = raw.indexOf("\n---", 3);
            if (end !== -1) {
                const fm = raw.slice(3, end).trim();
                const content = raw.slice(end + 4).trim();
                const yaml = parse(fm);
                const parsed = Agent.omit({ name: true, instructions: true }).parse(yaml);
                agent = {
                    ...agent,
                    ...parsed,
                    instructions: content,
                };
            }
        }

        return agent;
    }

    const repo = container.resolve<IAgentsRepo>('agentsRepo');
    return await repo.fetch(id);
}

/**
 * Determines if the agent loop should continue based on finish reason
 * Continues if finish reason indicates tool calls should be processed
 */
function shouldContinueLoop(finishReason: string | null): boolean {
    if (!finishReason) {
        return false;
    }
    return isToolCallFinishReason(finishReason);
}

function buildEmptyAssistantFallback(): z.infer<typeof AssistantMessage> {
    return {
        role: "assistant",
        content: [
            {
                type: "text",
                text: "The selected model returned no visible output for the last step. Please retry or switch to a different model/provider."
            }
        ],
    };
}

export async function* streamAgent({
    state,
    idGenerator,
    runId,
    messageQueue,
    modelConfigRepo,
    signal,
    abortRegistry,
    correlationId,
}: {
    state: AgentState,
    idGenerator: IMonotonicallyIncreasingIdGenerator;
    runId: string;
    messageQueue: IMessageQueue;
    modelConfigRepo: IModelConfigRepo;
    signal: AbortSignal;
    abortRegistry: IAbortRegistry;
    correlationId?: string;
}): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
    const activeCorrelationId = correlationId ?? crypto.randomUUID();
    const logger = new PrefixLogger(`run-${runId}-${state.agentName}`);

    const emitLog = (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
        const payload = {
            ts: new Date().toISOString(),
            level,
            service: 'agent-runtime',
            runId,
            correlationId: activeCorrelationId,
            message,
            ...extra,
        };
        console.log(JSON.stringify(payload));
    };

    async function* processEvent(event: z.infer<typeof RunEvent>): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
        state.ingest(event);
        yield event;
    }

    const modelConfig = await modelConfigRepo.getConfig();
    if (!modelConfig) {
        throw new Error("Model config not found");
    }

    // set up agent
    const agent = await loadAgent(state.agentName!);

    // Extract first user message for tool filtering
    const firstUserMessage = state.messages.find(m => m.role === 'user');
    const userMessage = firstUserMessage 
        ? (typeof firstUserMessage.content === 'string' 
            ? firstUserMessage.content 
            : firstUserMessage.content.map(c => c.type === 'text' ? c.text : '').join(' '))
        : '';

    // set up tools with smart filtering
    const requestedTools = await buildTools(agent, userMessage);
    const executionPolicy = getModelExecutionPolicy(modelConfig.provider);
    const tools = executionPolicy.toolExecutionMode === "full" ? requestedTools : {};

    // set up provider + model
    const provider = createProvider(modelConfig.provider);
      const memoryGraphAgents = ["note_creation", "labeling_agent", "email-draft", "meeting-prep"];
      const modelId = (memoryGraphAgents.includes(state.agentName!) && modelConfig.memoryGraphModel)
          ? modelConfig.memoryGraphModel
        : modelConfig.model;
    const model = provider.languageModel(modelId);
    logger.log(`using model: ${modelId}`);

    let loopCounter = 0;
    while (true) {
        console.time(`runtime-loop-iter-${loopCounter}`);
        // Check abort at the top of each iteration
        signal.throwIfAborted();

        loopCounter++;
        const loopLogger = logger.child(`iter-${loopCounter}`);
        loopLogger.log('starting loop iteration');

        // execute any pending tool calls
        for (const toolCallId of Object.keys(state.pendingToolCalls)) {
            const toolCall = state.toolCallIdMap[toolCallId];
            const _logger = loopLogger.child(`tc-${toolCallId}-${toolCall.toolName}`);
            _logger.log('processing');

            // if ask-human, skip
            if (toolCall.toolName === "ask-human") {
                _logger.log('skipping, reason: ask-human');
                continue;
            }

            // if tool has been denied, deny
            if (state.deniedToolCallIds[toolCallId]) {
                _logger.log('returning denied tool message, reason: tool has been denied');
                yield* processEvent({
                    runId,
                    messageId: await idGenerator.next(),
                    type: "message",
                    message: {
                        role: "tool",
                        content: "Unable to execute this tool: Permission was denied.",
                        toolCallId: toolCallId,
                        toolName: toolCall.toolName,
                    },
                    subflow: [],
                });
                continue;
            }

            // if permission is pending on this tool call, skip execution
            if (state.pendingToolPermissionRequests[toolCallId]) {
                _logger.log('skipping, reason: permission is pending');
                continue;
            }

            // execute approved tool
            // Check abort before starting tool execution
            if (signal.aborted) {
                _logger.log('skipping, reason: aborted');
                break;
            }
            _logger.log('executing tool');

            if (agent.tools![toolCall.toolName].type === "agent") {
                const subflowState = state.subflowStates[toolCallId];
                yield* handleSubflowDelegation({
                    toolCall,
                    toolCallId,
                    subflowState,
                    runId,
                    signal,
                    abortRegistry,
                    emitLog,
                    processEvent,
                    idGenerator,
                    streamAgentFn: streamAgent,
                    messageQueue,
                    modelConfigRepo,
                    activeCorrelationId
                });
            } else {
                yield* executeToolOrchestrator({
                    toolCall,
                    toolCallId,
                    agent,
                    runId,
                    signal,
                    abortRegistry,
                    emitLog,
                    processEvent,
                    idGenerator
                });
            }
        }

        // if waiting on user permission or ask-human, exit
        if (state.getPendingAskHumans().length || state.getPendingPermissions().length) {
            loopLogger.log('exiting loop, reason: pending asks or permissions');
            console.timeEnd(`runtime-loop-iter-${loopCounter - 1}`);
            return;
        }

        // get any queued user messages
        while (true) {
            const msg = await messageQueue.dequeue(runId);
            if (!msg) {
                break;
            }
            loopLogger.log('dequeued user message', msg.messageId);
            yield* processEvent({
                runId,
                type: "message",
                messageId: msg.messageId,
                message: {
                    role: "user",
                    content: msg.message,
                },
                subflow: [],
            });
        }

        // if last response is from assistant and text, exit
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage
            && lastMessage.role === "assistant"
            && (typeof lastMessage.content === "string"
                || !lastMessage.content.some(part => part.type === "tool-call")
            )
        ) {
            loopLogger.log('exiting loop, reason: last message is from assistant and text');
            console.timeEnd(`runtime-loop-iter-${loopCounter - 1}`);
            return;
        }

        // run one LLM turn.
        loopLogger.log('running llm turn');
        // stream agent response and build message
        const now = new Date();
        const currentDateTime = now.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        const compatibilityNote = executionPolicy.toolExecutionMode === "disabled" && Object.keys(requestedTools).length > 0
            ? "\n\nProvider compatibility note: Tool execution is disabled for this provider endpoint because it does not reliably return structured tool calls in Flazz. Do not claim to inspect tools, run MCP servers, browse, or execute actions. Answer directly with the information already available in the conversation and be explicit when tool access is unavailable."
            : "";
        
        // Build context using ContextBuilder
        // Get first user message to determine query for context building
        const firstUserMessage = state.messages.find(m => m.role === 'user');
        const query = firstUserMessage 
            ? (typeof firstUserMessage.content === 'string' 
                ? firstUserMessage.content 
                : firstUserMessage.content.map(c => c.type === 'text' ? c.text : '').join(' '))
            : '';
        
        // Build context (memory + skills)
        const contextParts = await contextBuilder.buildContext(query, {
            includeMemory: true,
            includeSkills: true,
            includeMemorySearch: false, // Don't auto-include memory note search (too expensive)
        });
        
        const contextSection = contextParts.length > 0 ? '\n\n' + contextParts.join('\n\n') : '';
        const instructionsWithDateTime = `Current date and time: ${currentDateTime}\n\n${agent.instructions}${compatibilityNote}${contextSection}`;
        let streamError: string | null = null;
        let lastFinishReason: "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other" | "unknown" | null = null;
        // Actual input tokens from the last LLM response — used for precise overflow detection.
        let lastActualInputTokens: number | undefined = undefined;
        const messageBuilder = new StreamStepMessageBuilder({
            sanitizeTextArtifacts: executionPolicy.sanitizeTextArtifacts,
        });
        
        // Budget prompt per model/provider rather than trimming by fixed message count.
        const MINIMUM_RECENT_MESSAGES = 20;
        const budget = resolveModelContextBudget(modelConfig.provider, modelId);
        const trimmedPrompt = trimMessagesForPrompt(state.messages, MINIMUM_RECENT_MESSAGES);
        if (trimmedPrompt.droppedMessages > 0 || trimmedPrompt.downgradedMessages > 0) {
            loopLogger.log(
                `trimmed prompt before compaction: dropped=${trimmedPrompt.droppedMessages} ` +
                `downgraded=${trimmedPrompt.downgradedMessages} ` +
                `messages=${state.messages.length}->${trimmedPrompt.messages.length}`
            );
        }
        const promptMessages = trimmedPrompt.messages;
        // ── Overflow / compaction decision ──────────────────────────────────────
        // Primary: use actual tokens from previous LLM turn if available.
        // Fallback: heuristic estimate before the prompt is sent.
        const overflowCheck = checkOverflow({
            actualInputTokens: lastActualInputTokens,
            estimatedTokens: estimatePromptTokens({
                messages: promptMessages,
                instructions: instructionsWithDateTime,
                tools,
            }),
            budget,
        });
        const estimatedPromptTokens = overflowCheck.usedTokens;
        loopLogger.log(`context check: tokens=${estimatedPromptTokens} source=${overflowCheck.source} threshold=${budget.compactionThreshold}`);

        const safeRecentMessages = buildSafeRecentMessages(promptMessages, MINIMUM_RECENT_MESSAGES);
        let modelMessages = overflowCheck.isOverflow
            ? safeRecentMessages
            : promptMessages;

        const messagesSinceLastCompaction = state.lastCompactionMessageCount == null
            ? Number.POSITIVE_INFINITY
            : Math.max(0, state.messages.length - state.lastCompactionMessageCount);
        const cooldownSatisfied = messagesSinceLastCompaction >= budget.recompactCooldownMessages;
        const mustCompactNow = estimatedPromptTokens >= budget.usableInputBudget;
        const shouldCompact = overflowCheck.isOverflow
            && (cooldownSatisfied || mustCompactNow);

        if (!cooldownSatisfied && overflowCheck.isOverflow && !mustCompactNow) {
            loopLogger.log(
                `skipping compaction due to cooldown: est=${estimatedPromptTokens} ` +
                `messagesSinceLast=${messagesSinceLastCompaction}/${budget.recompactCooldownMessages}`
            );
        }

        if (shouldCompact) {
            const MAX_CONSECUTIVE_COMPACTION_FAILURES = 3;
            if (state.consecutiveCompactionFailures >= MAX_CONSECUTIVE_COMPACTION_FAILURES) {
                // Circuit breaker open — compaction has failed too many times in a row.
                // Fall back to safe recent messages and continue without compacting.
                emitLog("warn", "compaction circuit breaker open \u2014 skipping compaction this turn", {
                    consecutiveFailures: state.consecutiveCompactionFailures,
                });
                modelMessages = safeRecentMessages;
            } else {
            const compactionId = await idGenerator.next();
            const estimatedTokensBefore = estimatePromptTokens({
                messages: promptMessages,
                instructions: instructionsWithDateTime,
                tools,
            });
            const messageCountBefore = promptMessages.length;

            loopLogger.log(
                `preparing context compaction: est=${estimatedPromptTokens} threshold=${budget.compactionThreshold} `
                + `target=${budget.targetPromptTokens} usable=${budget.usableInputBudget} context=${budget.contextLimit}`
            );
            const compactionStartEvent = {
                runId,
                type: "context-compaction-start",
                compactionId,
                strategy: "summary-window",
                escalated: false,
                messageCountBefore,
                estimatedTokensBefore,
                contextLimit: budget.contextLimit,
                usableInputBudget: budget.usableInputBudget,
                compactionThreshold: budget.compactionThreshold,
                targetThreshold: budget.targetPromptTokens,
                subflow: [],
                ts: new Date().toISOString(),
            } as z.infer<typeof RunEvent>;
            yield* processEvent(compactionStartEvent);

            try {
                // ── Step 1: try prune first — avoid full compaction if possible ──
                const pruneResult = pruneToolOutputs(promptMessages);
                if (pruneResult.prunedCount > 0) {
                    loopLogger.log(
                        `pruned ${pruneResult.prunedCount} tool results, saved ~${pruneResult.tokensSaved} tokens`
                    );
                    yield* processEvent(RunEvent.parse({
                        runId,
                        type: "context-pruned",
                        prunedCount: pruneResult.prunedCount,
                        tokensSaved: pruneResult.tokensSaved,
                        estimatedTokensAfter: Math.max(0, estimatedPromptTokens - pruneResult.tokensSaved),
                        subflow: [],
                        ts: new Date().toISOString(),
                    }));
                }
                const messagesForCompaction = pruneResult.messages;

                // ── Step 2: full compaction ──
                let compacted = await prepareCompactedContext({
                    messages: messagesForCompaction,
                    model,
                    signal,
                    recentBudgetTokens: budget.recentMessagesBudget,
                    previousSummary: state.compactedContextSummary,
                    previousAnchorHash: state.compactedContextAnchorHash,
                    previousCarryover: state.compactedContextCarryover,
                    previousTaskState: state.compactedTaskState,
                    reason: "compaction",
                    skipPrune: true, // already pruned above
                });
                let escalated = false;

                if (compacted.snapshot) {
                    const landedNearTarget = compacted.snapshot.estimatedTokensAfter <= budget.targetPromptTokens;
                    const savedEnough = compacted.snapshot.tokensSaved >= budget.minimumSavingsTokens;
                    if (!landedNearTarget || !savedEnough) {
                        escalated = true;
                        const escalatedStartEvent = {
                            runId,
                            type: "context-compaction-start",
                            compactionId: `${compactionId}-escalated`,
                            strategy: "summary-window",
                            escalated: true,
                            messageCountBefore,
                            estimatedTokensBefore,
                            contextLimit: budget.contextLimit,
                            usableInputBudget: budget.usableInputBudget,
                            compactionThreshold: budget.compactionThreshold,
                            targetThreshold: budget.targetPromptTokens,
                            subflow: [],
                            ts: new Date().toISOString(),
                        } as z.infer<typeof RunEvent>;
                        yield* processEvent(escalatedStartEvent);

                        loopLogger.log(
                            `escalating compaction: after=${compacted.snapshot.estimatedTokensAfter} `
                            + `target=${budget.targetPromptTokens} saved=${compacted.snapshot.tokensSaved}`
                        );

                        compacted = await prepareCompactedContext({
                            messages: messagesForCompaction,
                            model,
                            signal,
                            recentBudgetTokens: Math.max(8_000, Math.floor(budget.recentMessagesBudget * 0.7)),
                            previousSummary: state.compactedContextSummary,
                            previousAnchorHash: state.compactedContextAnchorHash,
                            previousCarryover: state.compactedContextCarryover,
                            previousTaskState: state.compactedTaskState,
                            reason: "compaction",
                            skipPrune: true,
                        });
                    }
                }
                modelMessages = compacted.messages;

                if (compacted.snapshot) {
                    const landedNearTarget = compacted.snapshot.estimatedTokensAfter <= budget.targetPromptTokens;
                    const savedEnough = compacted.snapshot.tokensSaved >= budget.minimumSavingsTokens;
                    loopLogger.log(
                        `compacted history: ${compacted.snapshot.omittedMessages} older messages summarized, `
                        + `${messageCountBefore} -> ${modelMessages.length} prompt messages `
                        + `(saved=${compacted.snapshot.tokensSaved}, target=${budget.targetPromptTokens}, `
                        + `landed=${landedNearTarget}, minSaved=${budget.minimumSavingsTokens})`
                    );
                    const compactionCompleteEvent = {
                        runId,
                        type: "context-compaction-complete",
                        compactionId,
                        strategy: "summary-window",
                        escalated,
                        summary: compacted.snapshot.summary,
                        anchorHash: compacted.snapshot.anchorHash,
                        provenanceRefs: compacted.snapshot.provenanceRefs,
                        omittedMessages: compacted.snapshot.omittedMessages,
                        recentMessages: compacted.snapshot.recentMessages,
                        messageCountBefore,
                        messageCountAfter: modelMessages.length,
                        estimatedTokensBefore: compacted.snapshot.estimatedTokensBefore,
                        estimatedTokensAfter: compacted.snapshot.estimatedTokensAfter,
                        tokensSaved: compacted.snapshot.tokensSaved,
                        reductionPercent: compacted.snapshot.reductionPercent,
                        contextLimit: budget.contextLimit,
                        usableInputBudget: budget.usableInputBudget,
                        compactionThreshold: budget.compactionThreshold,
                        targetThreshold: budget.targetPromptTokens,
                        reused: compacted.snapshot.reused,
                        subflow: [],
                        ts: new Date().toISOString(),
                    } as z.infer<typeof RunEvent>;
                    yield* processEvent(compactionCompleteEvent);
                    state.compactedContextCarryover = compacted.snapshot.carryover;
                    state.compactedTaskState = compacted.snapshot.taskState;
                    state.consecutiveCompactionFailures = 0; // ← reset circuit breaker on success

                    // Inject auto-continue so the agent resumes without manual user input.
                    const autoContinueMessage = buildAutoContinueMessage("compaction");
                    yield* processEvent({
                        runId,
                        messageId: await idGenerator.next(),
                        type: "message",
                        message: autoContinueMessage,
                        subflow: [],
                    });
                    modelMessages.push(autoContinueMessage);

                    if (!landedNearTarget || !savedEnough) {
                        loopLogger.log(
                            `compaction under target: after=${compacted.snapshot.estimatedTokensAfter} `
                            + `target=${budget.targetPromptTokens} saved=${compacted.snapshot.tokensSaved}`
                        );
                    }
                }
            } catch (error) {
                const compactionError = error instanceof Error ? error.message : "Context compaction failed";
                emitLog("warn", "context compaction failed", {
                    error: compactionError,
                    messages: state.messages.length,
                });
                const compactionFailedEvent = {
                    runId,
                    type: "context-compaction-failed",
                    compactionId,
                    strategy: "summary-window",
                    escalated: false,
                    error: compactionError,
                    messageCountBefore,
                    estimatedTokensBefore,
                    contextLimit: budget.contextLimit,
                    usableInputBudget: budget.usableInputBudget,
                    compactionThreshold: budget.compactionThreshold,
                    targetThreshold: budget.targetPromptTokens,
                    subflow: [],
                    ts: new Date().toISOString(),
                } as z.infer<typeof RunEvent>;
                yield* processEvent(compactionFailedEvent);
                modelMessages = safeRecentMessages;
                loopLogger.log(`falling back to safe recent history: ${messageCountBefore} -> ${modelMessages.length} messages`);

                // Circuit breaker: stop retrying compaction if it fails repeatedly.
                state.consecutiveCompactionFailures += 1;
                if (state.consecutiveCompactionFailures >= MAX_CONSECUTIVE_COMPACTION_FAILURES) {
                    emitLog("warn", `compaction circuit breaker open after ${state.consecutiveCompactionFailures} consecutive failures — compaction disabled for this run`, {
                        consecutiveFailures: state.consecutiveCompactionFailures,
                    });
                }
                }
            }
        } // end if (shouldCompact)
        for await (const event of streamLlm(
            model,
            modelMessages,
            instructionsWithDateTime,
            tools,
            signal,
        )) {
            messageBuilder.ingest(event);
            yield* processEvent({
                runId,
                type: "llm-stream-event",
                event: event,
                subflow: [],
            });
            if (event.type === "finish-step") {
                // Capture actual input tokens for the next overflow check.
                const usage = event.usage as Record<string, number> | undefined;
                if (usage) {
                    const inputTokens = usage.inputTokens ?? usage.promptTokens;
                    if (inputTokens !== undefined && inputTokens > 0) {
                        lastActualInputTokens = inputTokens;
                    }
                }
                yield* processEvent(RunEvent.parse({
                    runId,
                    type: "usage-update",
                    usage: event.usage,
                    finishReason: event.finishReason,
                    subflow: [],
                    ts: new Date().toISOString(),
                }));
            } else if (event.type === "finish") {
                const finishEvent = event as { usage?: Record<string, number>; totalUsage?: Record<string, number> };
                const usageInfo: Record<string, number> | undefined = finishEvent.usage ?? finishEvent.totalUsage;
                if (usageInfo) {
                    yield* processEvent(RunEvent.parse({
                        runId,
                        type: "usage-update",
                        usage: usageInfo,
                        finishReason: event.finishReason,
                        subflow: [],
                        ts: new Date().toISOString(),
                    }));
                }
            }
            if (event.type === "error") {
                streamError = event.error;
                emitLog("error", "provider error", { error: streamError, messages: state.messages.length });
                yield* processEvent({
                    runId,
                    type: "error",
                    error: streamError,
                    subflow: [],
                });
                break;
            }
            if (event.type === "finish-step" || event.type === "finish") {
                lastFinishReason = event.finishReason;
            }
        }

        let message = await normalizeAssistantMessage({
            message: messageBuilder.get(),
            agent,
            idGenerator,
            allowTextToolFallback: executionPolicy.allowTextToolFallback,
        });

        if (lastFinishReason === "length" && !hasVisibleAssistantOutput(message)) {
            message = appendLengthStopNotice(message);
        }
        if (!hasVisibleAssistantOutput(message)) {
            emitLog("warn", "provider returned no visible assistant output", {
                finishReason: lastFinishReason,
                messages: state.messages.length,
            });
            message = buildEmptyAssistantFallback();
        }
        yield* processEvent({
            runId,
            messageId: await idGenerator.next(),
            type: "message",
            message,
            subflow: [],
        });

        if (streamError) {
            console.timeEnd(`runtime-loop-iter-${loopCounter - 1}`);
            return;
        }

        // Check if we should continue the loop based on structured finish reason
        if (!shouldContinueLoop(lastFinishReason)) {
            console.timeEnd(`runtime-loop-iter-${loopCounter - 1}`);
            return;
        }

        yield* handlePermissionAndHumanRequests({
            message,
            agent,
            state,
            runId,
            idGenerator,
            emitLog,
            processEvent,
            loopLogger
        });
        console.timeEnd(`runtime-loop-iter-${loopCounter - 1}`);
    }
}
