/**
 * Composio IPC adapter
 *
 * Centralizes all window.ipc calls for Composio integration.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type ComposioDidConnectEvent = IPCChannels['composio:didConnect']['req']

export const composioIpc = {
  onDidConnect(handler: (event: ComposioDidConnectEvent) => void) {
    return window.ipc.on('composio:didConnect', handler)
  },
}
