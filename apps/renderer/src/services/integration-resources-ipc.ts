export const integrationResourcesIpc = {
  listResourceCatalog() {
    return window.ipc.invoke('integrations:listResourceCatalog', null)
  },
}
