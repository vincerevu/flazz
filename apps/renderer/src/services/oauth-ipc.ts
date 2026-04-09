/**
 * OAuth IPC adapter
 *
 * Centralizes all window.ipc calls for OAuth/auth domain.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type OAuthDidConnectEvent = IPCChannels['oauth:didConnect']['req']

export const oauthIpc = {
  getState() {
    return window.ipc.invoke('oauth:getState', null)
  },

  connect(provider: string, clientId?: string, clientSecret?: string) {
    return window.ipc.invoke('oauth:connect', { provider, clientId, clientSecret })
  },

  disconnect(provider: string) {
    return window.ipc.invoke('oauth:disconnect', { provider })
  },

  listProviders() {
    return window.ipc.invoke('oauth:list-providers', null)
  },

  onDidConnect(handler: (event: OAuthDidConnectEvent) => void) {
    return window.ipc.on('oauth:didConnect', handler)
  },
}
