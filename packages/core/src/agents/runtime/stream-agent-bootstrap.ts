import { Agent } from "@flazz/shared";
import { ToolSet } from "ai";
import { z } from "zod";
import { PrefixLogger } from "@flazz/shared";
import { IModelConfigRepo } from "../../models/repo.js";
import { createProvider } from "../../models/models.js";
import { IModelCapabilityRepo } from "../../models/capability-repo.js";
import {
  getModelExecutionPolicy,
  type ModelExecutionPolicy,
} from "../../models/provider-capabilities.js";
import { buildTools } from "./tool-orchestrator.js";
import { extractMessageText } from "./llm-turn-preparation.js";
import { loadAgent } from "../runtime.js";
import { AgentState } from "./agent-state.js";

const MEMORY_GRAPH_AGENTS = new Set(["note_creation", "labeling_agent", "email-draft", "meeting-prep"]);

export type StreamAgentBootstrap = {
  modelConfig: Awaited<ReturnType<IModelConfigRepo["getConfig"]>>;
  resolvedModelLimits?: NonNullable<Awaited<ReturnType<IModelCapabilityRepo["resolveLimits"]>>>;
  resolvedModelLimitSource?: "config" | "registry";
  agent: z.infer<typeof Agent>;
  requestedTools: ToolSet;
  tools: ToolSet;
  executionPolicy: ModelExecutionPolicy;
  modelId: string;
  model: ReturnType<ReturnType<typeof createProvider>["languageModel"]>;
};

export async function bootstrapStreamAgent(args: {
  state: AgentState;
  modelConfigRepo: IModelConfigRepo;
  modelCapabilityRepo: IModelCapabilityRepo;
  logger: PrefixLogger;
}): Promise<StreamAgentBootstrap> {
  const modelConfig = await args.modelConfigRepo.getConfig();
  if (!modelConfig) {
    throw new Error("Model config not found");
  }

  const agent = await loadAgent(args.state.agentName!);

  const firstUserMessage = args.state.messages.find((message) => message.role === "user");
  const userMessage = extractMessageText(firstUserMessage);

  const requestedTools = await buildTools(agent, userMessage);
  const executionPolicy = getModelExecutionPolicy(modelConfig.provider);
  const tools = executionPolicy.toolExecutionMode === "full" ? requestedTools : {};

  const provider = createProvider(modelConfig.provider);
  const modelId = (
    MEMORY_GRAPH_AGENTS.has(args.state.agentName!)
      && modelConfig.memoryGraphModel
  )
    ? modelConfig.memoryGraphModel
    : modelConfig.model;
  let resolvedModelLimits = modelConfig.limits;
  let resolvedModelLimitSource: "config" | "registry" | undefined = modelConfig.limits ? "config" : undefined;
  if (!resolvedModelLimits) {
    try {
      resolvedModelLimits = await args.modelCapabilityRepo.resolveLimits(modelConfig.provider, modelId) ?? undefined;
      if (resolvedModelLimits) {
        resolvedModelLimitSource = "registry";
      }
    } catch (error) {
      args.logger.log(
        `model capability registry lookup failed for ${modelId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const model = provider.languageModel(modelId);
  args.logger.log(`using model: ${modelId}`);

  return {
    modelConfig,
    resolvedModelLimits,
    resolvedModelLimitSource,
    agent,
    requestedTools,
    tools,
    executionPolicy,
    modelId,
    model,
  };
}
