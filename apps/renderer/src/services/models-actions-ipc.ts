/**
 * Models actions IPC adapter
 *
 * Covers model testing and config saving (distinct from models-ipc.ts
 * which only handles listing).
 */

export const modelsActionsIpc = {
  test(providerConfig: unknown) {
    return window.ipc.invoke('models:test', providerConfig)
  },

  saveConfig(providerConfig: unknown) {
    return window.ipc.invoke('models:saveConfig', providerConfig)
  },
}
