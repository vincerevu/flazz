/**
 * Search IPC adapter
 */

export const searchIpc = {
  query(query: string, limit: number, types: ('memory' | 'chat')[]) {
    return window.ipc.invoke('search:query', { query, limit, types })
  },
}
