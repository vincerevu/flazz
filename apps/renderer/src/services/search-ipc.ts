/**
 * Search IPC adapter
 */

export const searchIpc = {
  query(query: string, limit: number, types: ('knowledge' | 'chat')[]) {
    return window.ipc.invoke('search:query', { query, limit, types })
  },
}
