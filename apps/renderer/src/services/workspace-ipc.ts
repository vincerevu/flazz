/**
 * Workspace IPC adapter
 *
 * Centralizes all window.ipc calls for workspace domain.
 * Feature hooks and components should call these functions
 * instead of invoking window.ipc directly.
 */

import type { IPCChannels } from '@flazz/shared/src/ipc.js'

type ReaddirOptions = NonNullable<IPCChannels['workspace:readdir']['req']['opts']>
type Encoding = NonNullable<IPCChannels['workspace:readFile']['req']['encoding']>
type WriteFileOptions = NonNullable<IPCChannels['workspace:writeFile']['req']['opts']>
type RemoveOptions = NonNullable<IPCChannels['workspace:remove']['req']['opts']>

export const workspaceIpc = {
  readdir(path: string, opts?: Pick<ReaddirOptions, 'recursive' | 'includeHidden'>) {
    return window.ipc.invoke('workspace:readdir', { path, opts })
  },

  readFile(path: string, encoding?: Encoding) {
    return window.ipc.invoke('workspace:readFile', { path, ...(encoding ? { encoding } : {}) })
  },

  writeFile(path: string, data: string, opts?: Partial<Pick<WriteFileOptions, 'encoding' | 'mkdirp'>>) {
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

  remove(path: string, opts?: Pick<RemoveOptions, 'trash'>) {
    return window.ipc.invoke('workspace:remove', { path, opts })
  },

  mkdir(path: string, opts?: { recursive?: boolean }) {
    return window.ipc.invoke('workspace:mkdir', { path, ...(opts ? opts : {}) })
  },
}
