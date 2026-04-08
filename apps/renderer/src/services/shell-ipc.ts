/**
 * Shell IPC adapter
 *
 * Centralizes all window.ipc calls for shell/file system utilities.
 */

export const shellIpc = {
  readFileBase64(path: string) {
    return window.ipc.invoke('shell:readFileBase64', { path })
  },
}
