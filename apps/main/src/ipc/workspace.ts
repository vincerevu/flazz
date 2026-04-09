import { workspace } from '@flazz/core';
import type { InvokeHandlers } from '../ipc.js';

export function registerWorkspaceHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['workspace:getRoot'] = async () => {
    return workspace.getRoot();
  };
  handlers['workspace:exists'] = async (_, args) => {
    return workspace.exists(args.path);
  };
  handlers['workspace:stat'] = async (_event, args) => {
    return workspace.stat(args.path);
  };
  handlers['workspace:readdir'] = async (_event, args) => {
    return workspace.readdir(args.path, args.opts);
  };
  handlers['workspace:readFile'] = async (_event, args) => {
    return workspace.readFile(args.path, args.encoding);
  };
  handlers['workspace:writeFile'] = async (_event, args) => {
    return workspace.writeFile(args.path, args.data, args.opts);
  };
  handlers['workspace:mkdir'] = async (_event, args) => {
    return workspace.mkdir(args.path, args.recursive);
  };
  handlers['workspace:rename'] = async (_event, args) => {
    return workspace.rename(args.from, args.to, args.overwrite);
  };
  handlers['workspace:copy'] = async (_event, args) => {
    return workspace.copy(args.from, args.to, args.overwrite);
  };
  handlers['workspace:remove'] = async (_event, args) => {
    return workspace.remove(args.path, args.opts);
  };
}
