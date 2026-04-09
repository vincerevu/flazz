import { versionHistory } from '@flazz/core';
import type { InvokeHandlers } from '../ipc.js';

export function registerKnowledgeHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['knowledge:history'] = async (_event, args) => {
    const commits = await versionHistory.getFileHistory(args.path);
    return { commits };
  };
  handlers['knowledge:fileAtCommit'] = async (_event, args) => {
    const content = await versionHistory.getFileAtCommit(args.path, args.oid);
    return { content };
  };
  handlers['knowledge:restore'] = async (_event, args) => {
    await versionHistory.restoreFile(args.path, args.oid);
    return { ok: true };
  };
}
