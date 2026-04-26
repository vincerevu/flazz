import type { ComponentProps } from 'react'

import { ChatSidebar } from '@/components/chat-sidebar'
import { PanelErrorBoundary } from '@/components/panel-error-boundary'

type AppChatSidebarPaneProps = {
  chatSidebarProps: ComponentProps<typeof ChatSidebar>
  onReset: () => void
}

export function AppChatSidebarPane({
  chatSidebarProps,
  onReset,
}: AppChatSidebarPaneProps) {
  return (
    <PanelErrorBoundary panelName="Chat sidebar" onReset={onReset}>
      <ChatSidebar {...chatSidebarProps} />
    </PanelErrorBoundary>
  )
}
