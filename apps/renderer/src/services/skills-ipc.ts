import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type SkillViewResponse = IPCChannels['skills:view']['res']

export const skillsIpc = {
  list() {
    return window.ipc.invoke('skills:list', null)
  },

  view(name: string): Promise<SkillViewResponse> {
    return window.ipc.invoke('skills:view', { name })
  },

  listCandidates() {
    return window.ipc.invoke('skills:listCandidates', null)
  },

  promoteCandidate(signature: string) {
    return window.ipc.invoke('skills:promoteCandidate', { signature })
  },

  rejectCandidate(signature: string) {
    return window.ipc.invoke('skills:rejectCandidate', { signature })
  },

  getLearningStats() {
    return window.ipc.invoke('skills:getLearningStats', null)
  },

  listRepairCandidates() {
    return window.ipc.invoke('skills:listRepairCandidates', null)
  },

  listRevisions(name: string) {
    return window.ipc.invoke('skills:listRevisions', { name })
  },

  viewRevision(name: string, revisionId: string) {
    return window.ipc.invoke('skills:viewRevision', { name, revisionId })
  },

  rollbackToRevision(name: string, revisionId: string) {
    return window.ipc.invoke('skills:rollbackToRevision', { name, revisionId })
  },
}
