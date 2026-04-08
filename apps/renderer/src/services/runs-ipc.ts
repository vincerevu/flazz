/**
 * Runs IPC adapter
 *
 * Centralizes all window.ipc calls for runs/chat domain.
 * Feature hooks and components should call these functions
 * instead of invoking window.ipc directly.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type UserMessageContent = IPCChannels['runs:createMessage']['req']['message']
type PermissionAuthorization = IPCChannels['runs:authorizePermission']['req']['authorization']
type HumanReply = IPCChannels['runs:provideHumanInput']['req']['reply']

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

  createMessage(runId: string, message: UserMessageContent) {
    return window.ipc.invoke('runs:createMessage', { runId, message })
  },

  stop(runId: string, force?: boolean) {
    return window.ipc.invoke('runs:stop', { runId, force: force ?? false })
  },

  delete(runId: string) {
    return window.ipc.invoke('runs:delete', { runId })
  },

  authorizePermission(runId: string, authorization: PermissionAuthorization) {
    return window.ipc.invoke('runs:authorizePermission', { runId, authorization })
  },

  provideHumanInput(runId: string, reply: HumanReply) {
    return window.ipc.invoke('runs:provideHumanInput', { runId, reply })
  },

  onEvents(handler: (event: null) => void) {
    return window.ipc.on('runs:events', handler)
  },
}
