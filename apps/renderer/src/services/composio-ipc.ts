/**
 * Composio IPC adapter
 *
 * Centralizes all window.ipc calls for Composio integration.
 */

export const composioIpc = {
  onDidConnect(
    handler: (event: { toolkitSlug: string; success: boolean; error?: string }) => void,
  ) {
    return window.ipc.on('composio:didConnect', handler as (event: null) => void)
  },
}
