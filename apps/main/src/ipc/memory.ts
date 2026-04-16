import { versionHistory } from '@flazz/core';
import type { InvokeHandlers } from '../ipc.js';

export function registerMemoryHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['memory:history'] = async (_event, args) => {
    const commits = await versionHistory.getFileHistory(args.path);
    return { commits };
  };
  handlers['memory:fileAtCommit'] = async (_event, args) => {
    const content = await versionHistory.getFileAtCommit(args.path, args.oid);
    return { content };
  };
  handlers['memory:restore'] = async (_event, args) => {
    await versionHistory.restoreFile(args.path, args.oid);
    return { ok: true };
  };
}
