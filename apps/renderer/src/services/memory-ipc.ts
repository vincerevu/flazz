/**
 * Memory IPC adapter
 *
 * Centralizes all window.ipc calls for memory version history.
 */

export const memoryIpc = {
  history(path: string) {
    return window.ipc.invoke('memory:history', { path })
  },

  fileAtCommit(path: string, oid: string) {
    return window.ipc.invoke('memory:fileAtCommit', { path, oid })
  },

  restore(path: string, oid: string) {
    return window.ipc.invoke('memory:restore', { path, oid })
  },

  onDidCommit(handler: () => void) {
    return window.ipc.on('memory:didCommit', handler)
  },
}
