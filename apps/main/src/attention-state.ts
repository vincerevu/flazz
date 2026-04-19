type AttentionState = {
  activeRunId: string | null
  isWindowFocused: boolean
  isDocumentVisible: boolean
  notificationsEnabled: boolean
}

let attentionState: AttentionState = {
  activeRunId: null,
  isWindowFocused: true,
  isDocumentVisible: true,
  notificationsEnabled: true,
}

export function setAttentionState(next: AttentionState) {
  attentionState = next
}

export function getAttentionState(): AttentionState {
  return attentionState
}

export function shouldNotifyForRun(runId: string): boolean {
  if (!attentionState.notificationsEnabled) return false
  return !(
    attentionState.isWindowFocused
    && attentionState.isDocumentVisible
    && attentionState.activeRunId === runId
  )
}
