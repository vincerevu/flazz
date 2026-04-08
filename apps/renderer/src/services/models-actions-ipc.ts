/**
 * Models actions IPC adapter
 *
 * Covers model testing and config saving (distinct from models-ipc.ts
 * which only handles listing).
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type ModelConfig = IPCChannels['models:test']['req']

export const modelsActionsIpc = {
  test(providerConfig: ModelConfig) {
    return window.ipc.invoke('models:test', providerConfig)
  },

  saveConfig(providerConfig: ModelConfig) {
    return window.ipc.invoke('models:saveConfig', providerConfig)
  },
}
