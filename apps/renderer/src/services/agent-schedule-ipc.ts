/**
 * Agent Schedule IPC adapter
 *
 * Centralizes all window.ipc calls for agent scheduling.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type AgentScheduleEntry = IPCChannels['agent-schedule:updateAgent']['req']['entry']

export const agentScheduleIpc = {
  getConfig() {
    return window.ipc.invoke('agent-schedule:getConfig', null)
  },

  getState() {
    return window.ipc.invoke('agent-schedule:getState', null)
  },

  updateAgent(agentName: string, entry: AgentScheduleEntry) {
    return window.ipc.invoke('agent-schedule:updateAgent', { agentName, entry })
  },

  deleteAgent(agentName: string) {
    return window.ipc.invoke('agent-schedule:deleteAgent', { agentName })
  },
}
