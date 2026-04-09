import { connectProvider, disconnectProvider, listProviders } from '../oauth-handler.js';
import container from '@flazz/core/dist/di/container.js';
import type { IOAuthRepo } from '@flazz/core/dist/auth/repo.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerAuthHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['oauth:connect'] = async (_event, args) => {
    return await connectProvider(
      args.provider,
      args.clientId?.trim(),
      args.clientSecret?.trim()
    );
  };
  handlers['oauth:disconnect'] = async (_event, args) => {
    return await disconnectProvider(args.provider);
  };
  handlers['oauth:list-providers'] = async () => {
    return listProviders();
  };
  handlers['oauth:getState'] = async () => {
    const repo = container.resolve<IOAuthRepo>('oauthRepo');
    const config = await repo.getClientFacingConfig();
    return { config };
  };
}
