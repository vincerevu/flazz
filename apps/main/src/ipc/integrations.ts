import * as mcpCore from '@flazz/core/dist/mcp/mcp.js';
import * as composioHandler from '../composio-handler.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerIntegrationHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['mcp:listTools'] = async (_event, args) => {
    return mcpCore.listTools(args.serverName, args.cursor);
  };
  handlers['mcp:executeTool'] = async (_event, args) => {
    return { result: await mcpCore.executeTool(args.serverName, args.toolName, args.input) };
  };

  // Granola integration removed - service no longer used
  // handlers['granola:getConfig'] = async () => { ... };
  // handlers['granola:setConfig'] = async (_event, args) => { ... };

  // Composio integration handlers
  handlers['composio:is-configured'] = async () => {
    return composioHandler.isConfigured();
  };
  handlers['composio:set-api-key'] = async (_event, args) => {
    return composioHandler.setApiKey(args.apiKey);
  };
  handlers['composio:list-toolkits'] = async () => {
    return composioHandler.listToolkits();
  };
  handlers['composio:initiate-connection'] = async (_event, args) => {
    return composioHandler.initiateConnection(args.toolkitSlug);
  };
  handlers['composio:get-connection-status'] = async (_event, args) => {
    return composioHandler.getConnectionStatus(args.toolkitSlug);
  };
  handlers['composio:sync-connection'] = async (_event, args) => {
    return composioHandler.syncConnection(args.toolkitSlug, args.connectedAccountId);
  };
  handlers['composio:disconnect'] = async (_event, args) => {
    return composioHandler.disconnect(args.toolkitSlug);
  };
  handlers['composio:list-connected'] = async () => {
    return composioHandler.listConnected();
  };
  handlers['composio:execute-action'] = async (_event, args) => {
    return composioHandler.executeAction(args.actionSlug, args.toolkitSlug, args.input);
  };
}
