import type { ComponentProps } from 'react'

import { SidebarContentPanel } from '@/components/sidebar-content'
import { PanelErrorBoundary } from '@/components/panel-error-boundary'

type WorkspaceSidebarPaneProps = {
  sidebarProps: ComponentProps<typeof SidebarContentPanel>
  onReset: () => void
}

export function WorkspaceSidebarPane({
  sidebarProps,
  onReset,
}: WorkspaceSidebarPaneProps) {
  return (
    <PanelErrorBoundary panelName="Workspace sidebar" onReset={onReset}>
      <SidebarContentPanel {...sidebarProps} />
    </PanelErrorBoundary>
  )
}
