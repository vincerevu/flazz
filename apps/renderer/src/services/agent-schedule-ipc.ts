/**
 * Agent Schedule IPC adapter
 *
 * Centralizes all window.ipc calls for agent scheduling.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type AgentScheduleConfig = IPCChannels['agent-schedule:getConfig']['res']
type AgentScheduleState = IPCChannels['agent-schedule:getState']['res']
type AgentScheduleEntry = IPCChannels['agent-schedule:updateAgent']['req']['entry']

export const agentScheduleIpc = {
  getConfig(): Promise<AgentScheduleConfig> {
    return window.ipc.invoke('agent-schedule:getConfig', null)
  },

  getState(): Promise<AgentScheduleState> {
    return window.ipc.invoke('agent-schedule:getState', null)
  },

  updateAgent(agentName: string, entry: AgentScheduleEntry) {
    return window.ipc.invoke('agent-schedule:updateAgent', { agentName, entry })
  },

  deleteAgent(agentName: string) {
    return window.ipc.invoke('agent-schedule:deleteAgent', { agentName })
  },
}
