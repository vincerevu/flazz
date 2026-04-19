/**
 * App/window IPC adapter
 *
 * Centralizes all window.ipc calls for Electron window management.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type WindowState = IPCChannels['app:getWindowState']['res']
type AttentionState = IPCChannels['app:updateAttentionState']['req']
type NotificationActivatedEvent = IPCChannels['app:notificationActivated']['req']

export const appIpc = {
  getWindowState(): Promise<WindowState> {
    return window.ipc.invoke('app:getWindowState', null)
  },

  minimizeWindow() {
    return window.ipc.invoke('app:minimizeWindow', null)
  },

  toggleMaximizeWindow() {
    return window.ipc.invoke('app:toggleMaximizeWindow', null)
  },

  closeWindow() {
    return window.ipc.invoke('app:closeWindow', null)
  },

  updateAttentionState(state: AttentionState) {
    return window.ipc.invoke('app:updateAttentionState', state)
  },

  onWindowStateChanged(handler: (state: WindowState) => void) {
    return window.ipc.on('app:windowStateChanged', handler)
  },

  onNotificationActivated(handler: (event: NotificationActivatedEvent) => void) {
    return window.ipc.on('app:notificationActivated', handler)
  },
}
