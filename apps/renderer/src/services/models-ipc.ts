/**
 * Models IPC adapter
 *
 * Centralizes all window.ipc calls for model/provider domain.
 */

export const modelsIpc = {
  list() {
    return window.ipc.invoke('models:list', null)
  },

  getCapabilityStatus() {
    return window.ipc.invoke('models:getCapabilityStatus', null)
  },

  refreshCapabilities() {
    return window.ipc.invoke('models:refreshCapabilities', null)
  },
}
