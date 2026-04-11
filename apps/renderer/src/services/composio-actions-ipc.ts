/**
 * Composio actions IPC adapter
 *
 * Covers composio connection management actions (distinct from composio-ipc.ts
 * which only handles the event listener).
 */

export const composioActionsIpc = {
  isConfigured() {
    return window.ipc.invoke('composio:is-configured', null)
  },

  setApiKey(apiKey: string) {
    return window.ipc.invoke('composio:set-api-key', { apiKey })
  },

  listToolkits() {
    return window.ipc.invoke('composio:list-toolkits', null)
  },

  getConnectionStatus(toolkitSlug: string) {
    return window.ipc.invoke('composio:get-connection-status', { toolkitSlug })
  },

  initiateConnection(toolkitSlug: string) {
    return window.ipc.invoke('composio:initiate-connection', { toolkitSlug })
  },

  disconnect(toolkitSlug: string) {
    return window.ipc.invoke('composio:disconnect', { toolkitSlug })
  },
}
