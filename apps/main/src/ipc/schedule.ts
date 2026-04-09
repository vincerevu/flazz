import container from '@flazz/core/dist/di/container.js';
import { IAgentScheduleRepo } from '@flazz/core/dist/agent-schedule/repo.js';
import { IAgentScheduleStateRepo } from '@flazz/core/dist/agent-schedule/state-repo.js';
import { triggerRun as triggerAgentScheduleRun } from '@flazz/core/dist/agent-schedule/runner.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerScheduleHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['agent-schedule:getConfig'] = async () => {
    const repo = container.resolve<IAgentScheduleRepo>('agentScheduleRepo');
    try {
      return await repo.getConfig();
    } catch {
      // Return empty config if file doesn't exist
      return { agents: {} };
    }
  };
  handlers['agent-schedule:getState'] = async () => {
    const repo = container.resolve<IAgentScheduleStateRepo>('agentScheduleStateRepo');
    try {
      return await repo.getState();
    } catch {
      // Return empty state if file doesn't exist
      return { agents: {} };
    }
  };
  handlers['agent-schedule:updateAgent'] = async (_event, args) => {
    const repo = container.resolve<IAgentScheduleRepo>('agentScheduleRepo');
    await repo.upsert(args.agentName, args.entry);
    // Trigger the runner to pick up the change immediately
    triggerAgentScheduleRun();
    return { success: true };
  };
  handlers['agent-schedule:deleteAgent'] = async (_event, args) => {
    const repo = container.resolve<IAgentScheduleRepo>('agentScheduleRepo');
    const stateRepo = container.resolve<IAgentScheduleStateRepo>('agentScheduleStateRepo');
    await repo.delete(args.agentName);
    await stateRepo.deleteAgentState(args.agentName);
    return { success: true };
  };
}
