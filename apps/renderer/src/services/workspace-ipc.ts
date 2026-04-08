/**
 * Workspace IPC adapter
 *
 * Centralizes all window.ipc calls for workspace domain.
 * Feature hooks and components should call these functions
 * instead of invoking window.ipc directly.
 */

export const workspaceIpc = {
  readdir(path: string, opts?: { recursive?: boolean; includeHidden?: boolean }) {
    return window.ipc.invoke('workspace:readdir', { path, opts })
  },

  readFile(path: string, encoding?: string) {
    return window.ipc.invoke('workspace:readFile', { path, ...(encoding ? { encoding } : {}) })
  },

  writeFile(path: string, data: string, opts?: { encoding?: string; mkdirp?: boolean }) {
    return window.ipc.invoke('workspace:writeFile', { path, data, opts })
  },

  stat(path: string) {
    return window.ipc.invoke('workspace:stat', { path })
  },

  exists(path: string) {
    return window.ipc.invoke('workspace:exists', { path })
  },

  rename(from: string, to: string) {
    return window.ipc.invoke('workspace:rename', { from, to })
  },

  remove(path: string, opts?: { trash?: boolean }) {
    return window.ipc.invoke('workspace:remove', { path, opts })
  },

  mkdir(path: string, opts?: { recursive?: boolean }) {
    return window.ipc.invoke('workspace:mkdir', { path, ...(opts ? opts : {}) })
  },
}
