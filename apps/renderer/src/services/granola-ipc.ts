/**
 * Granola IPC adapter
 */

export const granolaIpc = {
  getConfig() {
    return window.ipc.invoke('granola:getConfig', null)
  },

  setConfig(enabled: boolean) {
    return window.ipc.invoke('granola:setConfig', { enabled })
  },
}
