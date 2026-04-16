export const runMemoryIpc = {
  list(limit?: number) {
    return window.ipc.invoke('run-memory:list', limit ? { limit } : {})
  },

  search(query: string, limit?: number) {
    return window.ipc.invoke('run-memory:search', {
      query,
      ...(limit ? { limit } : {}),
    })
  },
}
