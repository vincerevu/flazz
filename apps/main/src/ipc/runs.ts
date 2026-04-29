import * as runsCore from '@flazz/core/dist/runs/runs.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerRunsHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['runs:create'] = async (_event, args) => {
    return runsCore.createRun(args);
  };
  handlers['runs:createMessage'] = async (_event, args) => {
    return { messageId: await runsCore.createMessage(args.runId, args.message) };
  };
  handlers['runs:authorizePermission'] = async (_event, args) => {
    await runsCore.authorizePermission(args.runId, args.authorization);
    return { success: true };
  };
  handlers['runs:provideHumanInput'] = async (_event, args) => {
    await runsCore.replyToHumanInputRequest(args.runId, args.reply);
    return { success: true };
  };
  handlers['runs:stop'] = async (_event, args) => {
    await runsCore.stop(args.runId, args.force);
    return { success: true };
  };
  handlers['runs:fetch'] = async (_event, args) => {
    return runsCore.fetchRun(args.runId);
  };
  handlers['runs:fetchConversation'] = async (_event, args) => {
    return runsCore.fetchRunConversation(args.runId);
  };
  handlers['runs:list'] = async (_event, args) => {
    return runsCore.listRuns(args.cursor, { runType: args.runType });
  };
  handlers['runs:delete'] = async (_event, args) => {
    await runsCore.deleteRun(args.runId);
    return { success: true };
  };
}
