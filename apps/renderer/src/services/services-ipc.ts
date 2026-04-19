/**
 * Background services IPC adapter
 *
 * Centralizes all window.ipc calls for background service events.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type ServiceEvent = IPCChannels['services:events']['req']

export const servicesIpc = {
  onEvents(handler: (event: ServiceEvent) => void) {
    return window.ipc.on('services:events', handler)
  },
  triggerGraphSync(force = true) {
    return window.ipc.invoke('services:triggerGraphSync', { force })
  },
}
