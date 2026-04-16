import * as runMemoryCore from '@flazz/core/dist/run-memory/api.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerRunMemoryHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['run-memory:list'] = async (_event, args) => {
    return runMemoryCore.listRunMemory(args?.limit);
  };
  handlers['run-memory:search'] = async (_event, args) => {
    return runMemoryCore.searchRunMemory(args.query, args.limit);
  };
}
