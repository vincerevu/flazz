import { presentationExport } from '@flazz/core';
import type { InvokeHandlers } from '../ipc.js';

export function registerPresentationHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['presentation:exportDomPptx'] = async (_event, args) => {
    return presentationExport.exportDomPresentationToPptx(args);
  };
}
