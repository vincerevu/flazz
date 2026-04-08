/**
 * App/window IPC adapter
 *
 * Centralizes all window.ipc calls for Electron window management.
 */

export const appIpc = {
  getWindowState() {
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

  onWindowStateChanged(handler: (state: unknown) => void) {
    return window.ipc.on('app:windowStateChanged', handler as (event: null) => void)
  },
}
