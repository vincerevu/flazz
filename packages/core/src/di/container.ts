import { asClass, createContainer, InjectionMode } from "awilix";
import { FSModelConfigRepo, IModelConfigRepo } from "../models/repo.js";
import { FSMcpConfigRepo, IMcpConfigRepo } from "../mcp/repo.js";
import { FSAgentsRepo, IAgentsRepo } from "../agents/repo.js";
import { FSRunsRepo, IRunsRepo } from "../runs/repo.js";
import { IMonotonicallyIncreasingIdGenerator, IdGen } from "../application/lib/id-gen.js";
import { IMessageQueue, InMemoryMessageQueue } from "../application/lib/message-queue.js";
import { IBus, InMemoryBus } from "../application/lib/bus.js";
import { IRunsLock, InMemoryRunsLock } from "../runs/lock.js";
import { IAgentRuntime, AgentRuntime } from "../agents/runtime.js";
import { FSOAuthRepo, IOAuthRepo } from "../auth/repo.js";
import { FSClientRegistrationRepo, IClientRegistrationRepo } from "../auth/client-repo.js";
import { IAbortRegistry, InMemoryAbortRegistry } from "../runs/abort-registry.js";
import { FSAgentScheduleRepo, IAgentScheduleRepo } from "../agent-schedule/repo.js";
import { FSAgentScheduleStateRepo, IAgentScheduleStateRepo } from "../agent-schedule/state-repo.js";
import { MemoryRepo } from "../memory/memory-repo.js";
import { MemoryManager } from "../memory/memory-manager.js";
import { MemoryArchiver } from "../memory/memory-archiver.js";
import { setMemoryManager } from "../application/lib/tools/memory-tools.js";
import { setMemoryArchiver } from "../application/lib/tools/memory-archive-tool.js";
import { SkillRepo } from "../skills/skill-repo.js";
import { SkillManager } from "../skills/skill-manager.js";
import { setRunLearningService, setSkillManager } from "../application/lib/tools/skill-tools.js";
import { setAgentsRepo, setSkillRegistry } from "../application/lib/tools/agent-tools.js";
import { ContextBuilder } from "../agents/runtime/context-builder.js";
import { MemorySearchProvider } from "../search/memory_search.js";
import { WorkDir } from "../config/config.js";
import { WorkspaceSkillSource } from "../skills/workspace-skill-source.js";
import { SkillRegistry } from "../skills/registry.js";
import { SourceSkillSource } from "../application/assistant/skills/source-skill-source.js";
import { RunLearningService } from "../skills/run-learning-service.js";
import { LearningStateRepo } from "../skills/learning-state-repo.js";

const container = createContainer({
    injectionMode: InjectionMode.PROXY,
    strict: true,
});

container.register({
    idGenerator: asClass<IMonotonicallyIncreasingIdGenerator>(IdGen).singleton(),
    messageQueue: asClass<IMessageQueue>(InMemoryMessageQueue).singleton(),
    bus: asClass<IBus>(InMemoryBus).singleton(),
    runsLock: asClass<IRunsLock>(InMemoryRunsLock).singleton(),
    abortRegistry: asClass<IAbortRegistry>(InMemoryAbortRegistry).singleton(),
    agentRuntime: asClass<IAgentRuntime>(AgentRuntime).singleton(),

    mcpConfigRepo: asClass<IMcpConfigRepo>(FSMcpConfigRepo).singleton(),
    modelConfigRepo: asClass<IModelConfigRepo>(FSModelConfigRepo).singleton(),
    agentsRepo: asClass<IAgentsRepo>(FSAgentsRepo).singleton(),
    runsRepo: asClass<IRunsRepo>(FSRunsRepo).singleton(),
    oauthRepo: asClass<IOAuthRepo>(FSOAuthRepo).singleton(),
    clientRegistrationRepo: asClass<IClientRegistrationRepo>(FSClientRegistrationRepo).singleton(),
    agentScheduleRepo: asClass<IAgentScheduleRepo>(FSAgentScheduleRepo).singleton(),
    agentScheduleStateRepo: asClass<IAgentScheduleStateRepo>(FSAgentScheduleStateRepo).singleton(),
});

setAgentsRepo(container.resolve<IAgentsRepo>("agentsRepo"));

// Initialize Memory System
const memoryRepo = new MemoryRepo(WorkDir);
const memoryManager = new MemoryManager(memoryRepo, {
    agentMaxChars: 2200,
    userMaxChars: 1375,
    delimiter: '\n§\n', // Hermes format for multiline entries
});
// Initialize frozen snapshot at startup
memoryManager.initialize().catch(err => {
    console.error('Failed to initialize memory manager:', err);
});
setMemoryManager(memoryManager);

// Initialize Memory Archiver
const memoryArchiver = new MemoryArchiver(memoryRepo);
setMemoryArchiver(memoryArchiver);

// Initialize Skills System
const skillRepo = new SkillRepo(WorkDir);
const skillManager = new SkillManager(skillRepo);
setSkillManager(skillManager);
const workspaceSkillSource = new WorkspaceSkillSource(skillManager);
const sourceSkillSource = new SourceSkillSource();
const skillRegistry = new SkillRegistry([workspaceSkillSource, sourceSkillSource]);
setSkillRegistry(skillRegistry);
const learningStateRepo = new LearningStateRepo(WorkDir);
const runLearningService = new RunLearningService(
    skillManager,
    skillRegistry,
    learningStateRepo,
    container.resolve<IModelConfigRepo>("modelConfigRepo"),
);
setRunLearningService(runLearningService);

// Initialize Context Builder
const memorySearch = new MemorySearchProvider();
const contextBuilder = new ContextBuilder(memoryManager, skillRegistry, memorySearch);

// Export for use in agent runtime
export { memoryManager, memoryArchiver, skillManager, skillRegistry, runLearningService, contextBuilder };

export default container;
