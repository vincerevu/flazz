import fs from "fs";
import path from "path";
import crypto from "crypto";
import { WorkDir } from "../config/config.js";
import { getNoteCreationStrictness } from "../config/note_creation_config.js";
import { Agent } from "@flazz/shared";
import { RunEvent } from "@flazz/shared/dist/runs.js";
import { CopilotAgent } from "../application/assistant/agent.js";
import container, { contextBuilder, runLearningService, runMemoryService } from "../di/container.js";
import { IModelConfigRepo } from "../models/repo.js";
import { IModelCapabilityRepo } from "../models/capability-repo.js";
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
    handlePermissionAndHumanRequests,
    deriveRunCompactionMetrics,
    createMessageEvent,
    createRunStatusEvent,
    prepareLlmTurn,
    assessCompactionNeed,
    checkOverflow,
    consumeLlmStream,
    finalizeAssistantMessage,
    executePendingToolCalls,
    shouldExitForPendingRequests,
    shouldExitAfterAssistantResponse,
    drainQueuedUserMessages,
    bootstrapStreamAgent,
    runCompactionPhase,
} from "./runtime/index.js";
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
    private modelCapabilityRepo: IModelCapabilityRepo;
    private runsLock: IRunsLock;
    private abortRegistry: IAbortRegistry;

    constructor({
        runsRepo,
        idGenerator,
        bus,
        messageQueue,
        modelConfigRepo,
        modelCapabilityRepo,
        runsLock,
        abortRegistry,
    }: {
        runsRepo: IRunsRepo;
        idGenerator: IMonotonicallyIncreasingIdGenerator;
        bus: IBus;
        messageQueue: IMessageQueue;
        modelConfigRepo: IModelConfigRepo;
        modelCapabilityRepo: IModelCapabilityRepo;
        runsLock: IRunsLock;
        abortRegistry: IAbortRegistry;
    }) {
        this.runsRepo = runsRepo;
        this.idGenerator = idGenerator;
        this.bus = bus;
        this.messageQueue = messageQueue;
        this.modelConfigRepo = modelConfigRepo;
        this.modelCapabilityRepo = modelCapabilityRepo;
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
                        modelCapabilityRepo: this.modelCapabilityRepo,
                        signal,
                        abortRegistry: this.abortRegistry,
                        correlationId,
                    })) {
                        if (!event || typeof event !== "object" || typeof (event as { type?: unknown }).type !== "string") {
                            console.warn(JSON.stringify({
                                ts: new Date().toISOString(),
                                level: "warn",
                                service: "agent-runtime",
                                runId,
                                correlationId,
                                message: "invalid run event yielded from streamAgent; skipping",
                                event,
                            }));
                            continue;
                        }
                        if (event.type !== "run-status") {
                            eventCount++;
                        }
                        if (event.type !== "llm-stream-event" && event.type !== "run-status") {
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

function isRunEventLike(event: unknown): event is z.infer<typeof RunEvent> {
    return typeof event === "object"
        && event !== null
        && typeof (event as { type?: unknown }).type === "string";
}

function categorizeCompactionError(error: unknown): "abort" | "provider" | "invalid-response" | "parse" | "other" {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const normalized = message.toLowerCase();

    if (error instanceof Error && error.name === "AbortError") return "abort";
    if (normalized.includes("invalid json response") || normalized.includes("unexpected token")) {
        return "invalid-response";
    }
    if (normalized.includes("parse")) {
        return "parse";
    }
    if (
        normalized.includes("cloudflare")
        || normalized.includes("error 520")
        || normalized.includes("web server is returning an unknown error")
        || normalized.includes("provider")
        || normalized.includes("api.minimax.io")
    ) {
        return "provider";
    }
    return "other";
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

export async function* streamAgent({
    state,
    idGenerator,
    runId,
    messageQueue,
    modelConfigRepo,
    modelCapabilityRepo,
    signal,
    abortRegistry,
    correlationId,
}: {
    state: AgentState,
    idGenerator: IMonotonicallyIncreasingIdGenerator;
    runId: string;
    messageQueue: IMessageQueue;
    modelConfigRepo: IModelConfigRepo;
    modelCapabilityRepo: IModelCapabilityRepo;
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
        if (!isRunEventLike(event)) {
            emitLog("warn", "attempted to process invalid run event; skipping", { event });
            return;
        }
        state.ingest(event);
        yield event;
    }

    async function* emitStatus(
        phase: "checking"
            | "running-tool"
            | "preparing-context"
            | "checking-context"
            | "compacting-context"
            | "waiting-for-model"
            | "processing-response"
            | "finalizing",
        message: string,
        toolName?: string,
        contextDebug?: {
            providerFlavor: string;
            modelId: string;
            contextLimit: number;
            usableInputBudget: number;
            outputReserve: number;
            compactionThreshold: number;
            targetThreshold: number;
            estimatedPromptTokens: number;
            overflowSource: "estimated" | "actual" | "none";
            budgetSource: "config" | "registry" | "fallback" | "unknown";
        },
    ): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
        yield* processEvent(createRunStatusEvent({
            runId,
            phase,
            message,
            toolName,
            contextDebug,
        }));
    }

    const {
        modelConfig,
        resolvedModelLimits,
        resolvedModelLimitSource,
        agent,
        requestedTools,
        tools,
        executionPolicy,
        modelId,
        model,
    } = await bootstrapStreamAgent({
        state,
        modelConfigRepo,
        modelCapabilityRepo,
        logger,
    });

    let loopCounter = 0;
    while (true) {
        const timerLabel = `runtime-loop-${runId}-iter-${loopCounter}`;
        console.time(timerLabel);
        // Check abort at the top of each iteration
        signal.throwIfAborted();

        loopCounter++;
        const loopLogger = logger.child(`iter-${loopCounter}`);
        loopLogger.log('starting loop iteration');
        yield* emitStatus("checking", "Checking next action...");

        const toolExecutionResult = yield* executePendingToolCalls({
            state,
            agent,
            runId,
            signal,
            abortRegistry,
            emitLog,
            processEvent,
            emitStatus,
            idGenerator,
            loopLogger,
            messageQueue,
            modelConfigRepo,
            modelCapabilityRepo,
            activeCorrelationId,
            streamAgentFn: streamAgent,
        });
        if (toolExecutionResult.aborted) {
            console.timeEnd(timerLabel);
            return;
        }

        // if waiting on user permission or ask-human, exit
        if (shouldExitForPendingRequests(state)) {
            loopLogger.log('exiting loop, reason: pending asks or permissions');
            console.timeEnd(timerLabel);
            return;
        }

        // get any queued user messages
        yield* drainQueuedUserMessages({
            runId,
            messageQueue,
            loopLogger,
            processEvent,
        });

        // if last response is from assistant and text, exit
        if (shouldExitAfterAssistantResponse(state.messages)) {
            loopLogger.log('exiting loop, reason: last message is from assistant and text');
            console.timeEnd(timerLabel);
            return;
        }

        // run one LLM turn.
        loopLogger.log('running llm turn');
        yield* emitStatus("preparing-context", "Preparing context...");
        const messageBuilder = new StreamStepMessageBuilder({
            sanitizeTextArtifacts: executionPolicy.sanitizeTextArtifacts,
        });

        const turnPreparation = await prepareLlmTurn({
            state,
            agentInstructions: agent.instructions,
            executionPolicy: {
                toolExecutionMode: executionPolicy.toolExecutionMode,
            },
            requestedToolCount: Object.keys(requestedTools).length,
            tools,
            provider: modelConfig.provider,
            modelId,
            modelLimits: resolvedModelLimits,
            modelLimitSource: resolvedModelLimitSource,
            contextBuilder,
        });
        const {
            instructionsWithDateTime,
            promptMessages,
            operationalPromptSource,
            safeRecentMessages,
            budget,
            compactionConfig,
            overflowCheck,
            assessment,
            estimatedPromptTokens,
            sanitizedPromptSourceCount,
            trimmedPromptSourceCount,
            droppedMessages,
            downgradedMessages,
        } = turnPreparation;

        if (sanitizedPromptSourceCount !== operationalPromptSource.length) {
            loopLogger.log(
                `sanitized prompt history: messages=${operationalPromptSource.length}->${sanitizedPromptSourceCount}`
            );
        }
        if (droppedMessages > 0 || downgradedMessages > 0) {
            loopLogger.log(
                `trimmed prompt before compaction: dropped=${droppedMessages} ` +
                `downgraded=${downgradedMessages} ` +
                `messages=${sanitizedPromptSourceCount}->${trimmedPromptSourceCount}`
            );
        }
        loopLogger.log(
            `context check: tokens=${estimatedPromptTokens} overflowSource=${overflowCheck.source} `
            + `budgetSource=${budget.source} contextLimit=${budget.contextLimit} `
            + `usable=${budget.usableInputBudget} outputReserve=${budget.outputReserve} `
            + `threshold=${budget.compactionThreshold} target=${budget.targetPromptTokens}`,
        );
        yield* emitStatus("checking-context", "Checking context window...", undefined, {
            providerFlavor: modelConfig.provider.flavor,
            modelId,
            contextLimit: budget.contextLimit,
            usableInputBudget: budget.usableInputBudget,
            outputReserve: budget.outputReserve,
            compactionThreshold: budget.compactionThreshold,
            targetThreshold: budget.targetPromptTokens,
            estimatedPromptTokens,
            overflowSource: overflowCheck.source,
            budgetSource: budget.source,
        });
        let modelMessages = overflowCheck.isOverflow
            ? safeRecentMessages
            : promptMessages;

        const compactionPhaseResult = await runCompactionPhase({
            runId,
            state,
            assessment,
            overflowed: overflowCheck.isOverflow,
            budget,
            promptMessages,
            safeRecentMessages,
            modelMessages,
            model,
            signal,
            compactionConfig,
            processEvent,
            emitStatus,
            nextId: () => idGenerator.next(),
            log: (message) => loopLogger.log(message),
            warn: (message, extra) => emitLog("warn", message, extra),
            categorizeError: categorizeCompactionError,
        });
        modelMessages = compactionPhaseResult.modelMessages;
        yield* emitStatus("waiting-for-model", "Waiting for model response...");
        const streamResult = yield* consumeLlmStream({
            runId,
            model,
            modelMessages,
            instructionsWithDateTime,
            tools,
            signal,
            messageBuilder,
            processEvent,
            emitLog: (level, message, extra) => emitLog(level, message, {
                ...extra,
                ...(level === "error" ? { messages: state.messages.length } : {}),
            }),
        });

        yield* emitStatus("processing-response", "Processing model response...");
        const message = await finalizeAssistantMessage({
            messageBuilder,
            agent,
            idGenerator,
            allowTextToolFallback: executionPolicy.allowTextToolFallback,
            lastFinishReason: streamResult.lastFinishReason,
            streamError: streamResult.streamError,
            emitLog,
            stateMessageCount: state.messages.length,
        });
        yield* processEvent({
            ...createMessageEvent({
                runId,
                messageId: await idGenerator.next(),
                message,
            }),
        });

        if (streamResult.streamError) {
            console.timeEnd(timerLabel);
            return;
        }

        // Check if we should continue the loop based on structured finish reason
        if (!shouldContinueLoop(streamResult.lastFinishReason)) {
            const postResponsePreparation = await prepareLlmTurn({
                state,
                agentInstructions: agent.instructions,
                executionPolicy: {
                    toolExecutionMode: executionPolicy.toolExecutionMode,
                },
                requestedToolCount: Object.keys(requestedTools).length,
                tools,
                provider: modelConfig.provider,
                modelId,
                modelLimits: resolvedModelLimits,
                modelLimitSource: resolvedModelLimitSource,
                contextBuilder,
            });
            const postResponseOverflowCheck = checkOverflow({
                actualTokens: state.lastObservedInputTokens ?? undefined,
                estimatedTokens: postResponsePreparation.estimatedPromptTokens,
                budget: postResponsePreparation.budget,
            });
            const postResponseAssessment = assessCompactionNeed({
                state,
                promptMessages: postResponsePreparation.promptMessages,
                operationalPromptSource: postResponsePreparation.operationalPromptSource,
                instructions: postResponsePreparation.instructionsWithDateTime,
                tools,
                budget: postResponsePreparation.budget,
                overflowCheck: postResponseOverflowCheck,
                compactionConfig: postResponsePreparation.compactionConfig,
            });

            if (postResponseAssessment.shouldCompact) {
                loopLogger.log(
                    `post-response context check: actual=${state.lastObservedInputTokens ?? "none"} `
                    + `estimated=${postResponsePreparation.estimatedPromptTokens} overflowSource=${postResponseOverflowCheck.source} `
                    + `threshold=${postResponsePreparation.budget.compactionThreshold} usable=${postResponsePreparation.budget.usableInputBudget}`,
                );
                await runCompactionPhase({
                    runId,
                    state,
                    assessment: postResponseAssessment,
                    overflowed: postResponseOverflowCheck.isOverflow,
                    budget: postResponsePreparation.budget,
                    promptMessages: postResponsePreparation.promptMessages,
                    safeRecentMessages: postResponsePreparation.safeRecentMessages,
                    modelMessages: postResponsePreparation.promptMessages,
                    model,
                    signal,
                    compactionConfig: postResponsePreparation.compactionConfig,
                    processEvent,
                    emitStatus,
                    nextId: () => idGenerator.next(),
                    log: (message) => loopLogger.log(message),
                    warn: (message, extra) => emitLog("warn", message, extra),
                    categorizeError: categorizeCompactionError,
                });
            }
            console.timeEnd(timerLabel);
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
        console.timeEnd(timerLabel);
    }
}
