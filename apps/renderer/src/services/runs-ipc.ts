/**
 * Runs IPC adapter
 *
 * Centralizes all window.ipc calls for runs/chat domain.
 * Feature hooks and components should call these functions
 * instead of invoking window.ipc directly.
 */

export const runsIpc = {
  list(cursor?: string) {
    return window.ipc.invoke('runs:list', { cursor })
  },

  fetch(runId: string) {
    return window.ipc.invoke('runs:fetch', { runId })
  },

  create(agentId: string) {
    return window.ipc.invoke('runs:create', { agentId })
  },

  createMessage(runId: string, message: unknown) {
    return window.ipc.invoke('runs:createMessage', { runId, message })
  },

  stop(runId: string, force?: boolean) {
    return window.ipc.invoke('runs:stop', { runId, force })
  },

  delete(runId: string) {
    return window.ipc.invoke('runs:delete', { runId })
  },

  authorizePermission(
    runId: string,
    authorization: {
      subflow: string[]
      toolCallId: string
      response: string
      scope?: 'once' | 'session' | 'always'
    },
  ) {
    return window.ipc.invoke('runs:authorizePermission', { runId, authorization })
  },

  provideHumanInput(
    runId: string,
    reply: { subflow: string[]; toolCallId: string; response: string },
  ) {
    return window.ipc.invoke('runs:provideHumanInput', { runId, reply })
  },

  onEvents(handler: (event: null) => void) {
    return window.ipc.on('runs:events', handler)
  },
}
