import { listOnboardingModels } from '@flazz/core/dist/models/model-catalog.js';
import { testModelConnection } from '@flazz/core/dist/models/models.js';
import container from '@flazz/core/dist/di/container.js';
import type { IModelConfigRepo } from '@flazz/core/dist/models/repo.js';
import type { IModelCapabilityRepo } from '@flazz/core/dist/models/capability-repo.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerModelsHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['models:list'] = async () => {
    return await listOnboardingModels();
  };
  handlers['models:test'] = async (_event, args) => {
    return await testModelConnection(args.provider, args.model);
  };
  handlers['models:saveConfig'] = async (_event, args) => {
    const repo = container.resolve<IModelConfigRepo>('modelConfigRepo');
    await repo.setConfig(args);
    return { success: true };
  };
  handlers['models:getCapabilityStatus'] = async () => {
    const repo = container.resolve<IModelCapabilityRepo>('modelCapabilityRepo');
    return await repo.getStatus();
  };
  handlers['models:refreshCapabilities'] = async () => {
    const repo = container.resolve<IModelCapabilityRepo>('modelCapabilityRepo');
    const registry = await repo.refreshRegistry();
    return {
      success: true as const,
      syncedAt: registry.syncedAt,
      source: registry.source,
      sourceFetchedAt: registry.sourceFetchedAt,
      providerCount: Object.keys(registry.providers).length,
    };
  };
}
