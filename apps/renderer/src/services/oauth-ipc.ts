/**
 * OAuth IPC adapter
 *
 * Centralizes all window.ipc calls for OAuth/auth domain.
 */

export const oauthIpc = {
  getState() {
    return window.ipc.invoke('oauth:getState', null)
  },

  connect(provider: string, clientId?: string) {
    return window.ipc.invoke('oauth:connect', { provider, clientId })
  },

  disconnect(provider: string) {
    return window.ipc.invoke('oauth:disconnect', { provider })
  },

  listProviders() {
    return window.ipc.invoke('oauth:list-providers', null)
  },

  onDidConnect(handler: (event: { provider: string; success: boolean; error?: string }) => void) {
    return window.ipc.on('oauth:didConnect', handler as (event: null) => void)
  },
}
