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
import { FSGranolaConfigRepo, IGranolaConfigRepo } from "../knowledge/granola/repo.js";
import { IAbortRegistry, InMemoryAbortRegistry } from "../runs/abort-registry.js";
import { FSAgentScheduleRepo, IAgentScheduleRepo } from "../agent-schedule/repo.js";
import { FSAgentScheduleStateRepo, IAgentScheduleStateRepo } from "../agent-schedule/state-repo.js";
import { MemoryRepo } from "../memory/memory-repo.js";
import { MemoryManager } from "../memory/memory-manager.js";
import { setMemoryManager } from "../application/lib/tools/memory-tools.js";
import { SkillRepo } from "../skills/skill-repo.js";
import { SkillManager } from "../skills/skill-manager.js";
import { setSkillManager } from "../application/lib/tools/skill-tools.js";
import { WorkDir } from "../config/config.js";

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
    granolaConfigRepo: asClass<IGranolaConfigRepo>(FSGranolaConfigRepo).singleton(),
    agentScheduleRepo: asClass<IAgentScheduleRepo>(FSAgentScheduleRepo).singleton(),
    agentScheduleStateRepo: asClass<IAgentScheduleStateRepo>(FSAgentScheduleStateRepo).singleton(),
});

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

// Initialize Skills System
const skillRepo = new SkillRepo(WorkDir);
const skillManager = new SkillManager(skillRepo);
setSkillManager(skillManager);

export default container;