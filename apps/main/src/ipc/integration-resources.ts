import * as integrationsCore from '@flazz/core/dist/integrations/api.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerIntegrationResourceHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['integrations:listResourceCatalog'] = async () => {
    return integrationsCore.listIntegrationResourceCatalog();
  };
}
