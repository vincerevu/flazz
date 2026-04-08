/**
 * Knowledge IPC adapter
 *
 * Centralizes all window.ipc calls for knowledge domain
 * (version history, git commits).
 */

export const knowledgeIpc = {
  history(path: string) {
    return window.ipc.invoke('knowledge:history', { path })
  },

  fileAtCommit(path: string, oid: string) {
    return window.ipc.invoke('knowledge:fileAtCommit', { path, oid })
  },

  restore(path: string, oid: string) {
    return window.ipc.invoke('knowledge:restore', { path, oid })
  },

  onDidCommit(handler: () => void) {
    return window.ipc.on('knowledge:didCommit', handler)
  },
}
