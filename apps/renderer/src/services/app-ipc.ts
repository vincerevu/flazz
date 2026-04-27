/**
 * App/window IPC adapter
 *
 * Centralizes all window.ipc calls for Electron window management.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type WindowState = IPCChannels['app:getWindowState']['res']
type VersionInfo = IPCChannels['app:getVersions']['res']
type UpdateCheckResult = IPCChannels['app:checkForUpdates']['res']
type UpdateStatus = IPCChannels['app:getUpdateStatus']['res']
type PerformUpdateResult = IPCChannels['app:performUpdate']['res']
type AttentionState = IPCChannels['app:updateAttentionState']['req']
type NotificationActivatedEvent = IPCChannels['app:notificationActivated']['req']

export const appIpc = {
  getVersions(): Promise<VersionInfo> {
    return window.ipc.invoke('app:getVersions', null)
  },

  checkForUpdates(): Promise<UpdateCheckResult> {
    return window.ipc.invoke('app:checkForUpdates', null)
  },

  getUpdateStatus(): Promise<UpdateStatus> {
    return window.ipc.invoke('app:getUpdateStatus', null)
  },

  performUpdate(): Promise<PerformUpdateResult> {
    return window.ipc.invoke('app:performUpdate', null)
  },

  openUpdateUrl(url: string) {
    return window.ipc.invoke('app:openUpdateUrl', { url })
  },

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

  onUpdateStatusChanged(handler: (status: UpdateStatus) => void) {
    return window.ipc.on('app:updateStatusChanged', handler)
  },
}
