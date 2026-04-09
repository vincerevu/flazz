import { listOnboardingModels } from '@flazz/core/dist/models/models-dev.js';
import { testModelConnection } from '@flazz/core/dist/models/models.js';
import container from '@flazz/core/dist/di/container.js';
import type { IModelConfigRepo } from '@flazz/core/dist/models/repo.js';
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
}
