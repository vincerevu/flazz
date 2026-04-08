/**
 * Background services IPC adapter
 *
 * Centralizes all window.ipc calls for background service events.
 */

export const servicesIpc = {
  onEvents(handler: (event: unknown) => void) {
    return window.ipc.on('services:events', handler as (event: null) => void)
  },
}
