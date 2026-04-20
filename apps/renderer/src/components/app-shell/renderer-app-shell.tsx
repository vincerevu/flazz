import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
  MinusIcon,
  PanelLeftIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarSectionProvider, useSidebarSection, type ActiveSection } from '@/contexts/sidebar-context'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const DEFAULT_SIDEBAR_WIDTH = 256
const CUSTOM_TITLEBAR_HEIGHT_PX = 40
const TITLEBAR_LEADING_WIDTH_PX = 96
const TITLEBAR_TRAILING_WIDTH_PX = 150

function FlazzTitlebarBrand({
  logoSrc,
  isSidebarVisible,
  onToggleSidebar,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
}: {
  logoSrc: string
  isSidebarVisible: boolean
  onToggleSidebar: () => void
  canNavigateBack: boolean
  canNavigateForward: boolean
  onNavigateBack: () => void
  onNavigateForward: () => void
}) {
  return (
    <div className="titlebar-no-drag relative z-20 flex min-w-0 shrink-0 items-center pl-3 pr-2 gap-1">
      <img
        src={logoSrc}
        alt="Flazz"
        className="h-5 w-5 shrink-0 object-contain mr-1"
        draggable={false}
      />
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onPointerDown={(event) => {
          event.stopPropagation();
          onToggleSidebar();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
        }}
        aria-label={isSidebarVisible ? "Hide sidebar" : "Show sidebar"}
        aria-pressed={isSidebarVisible}
      >
        <PanelLeftIcon className="size-4" />
      </button>

      <button
        type="button"
        onClick={onNavigateBack}
        disabled={!canNavigateBack}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        aria-label="Go back"
      >
        <ArrowLeftIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={onNavigateForward}
        disabled={!canNavigateForward}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        aria-label="Go forward"
      >
        <ArrowRightIcon className="size-4" />
      </button>
    </div>
  )
}

function DesktopTitlebarLeadingControls({
  logoSrc,
  isSidebarVisible,
  onToggleSidebar,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
}: {
  logoSrc: string
  isSidebarVisible: boolean
  onToggleSidebar: () => void
  canNavigateBack: boolean
  canNavigateForward: boolean
  onNavigateBack: () => void
  onNavigateForward: () => void
}) {
  return (
    <div
      className="titlebar-no-drag absolute left-0 top-0 z-40 flex h-10 items-center"
      style={{ width: TITLEBAR_LEADING_WIDTH_PX + 40 }}
    >
      <FlazzTitlebarBrand
        logoSrc={logoSrc}
        isSidebarVisible={isSidebarVisible}
        onToggleSidebar={onToggleSidebar}
        canNavigateBack={canNavigateBack}
        canNavigateForward={canNavigateForward}
        onNavigateBack={onNavigateBack}
        onNavigateForward={onNavigateForward}
      />
    </div>
  )
}

function DesktopWindowControls({
  isMaximized,
  supportsCustomTitlebar,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  isMaximized: boolean
  supportsCustomTitlebar: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}) {
  if (!supportsCustomTitlebar) {
    return null
  }

  return (
    <div className="titlebar-no-drag ml-2 flex h-full shrink-0 items-stretch border-l border-border/70">
      <button
        type="button"
        onClick={onMinimize}
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Minimize window"
      >
        <MinusIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={onToggleMaximize}
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
      >
        {isMaximized ? <CopyIcon className="size-4" /> : <SquareIcon className="size-4" />}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-500 hover:text-white"
        aria-label="Close window"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  )
}

function DesktopTitlebar({
  isMaximized,
  supportsCustomTitlebar,
  onToggleMaximize,
  onMinimize,
  onClose,
}: {
  isMaximized: boolean
  supportsCustomTitlebar: boolean
  onToggleMaximize: () => void
  onMinimize: () => void
  onClose: () => void
}) {
  if (!supportsCustomTitlebar) {
    return null
  }

  return (
    <header className="titlebar-no-drag absolute inset-x-0 top-0 z-30 flex h-10 items-stretch border-b border-border bg-sidebar/95 backdrop-blur">
      <div className="min-w-0 flex-1" />
      <div className="titlebar-no-drag absolute inset-y-0 right-0 z-20 flex items-stretch">
        <DesktopWindowControls
          isMaximized={isMaximized}
          supportsCustomTitlebar={supportsCustomTitlebar}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />
      </div>
      {/* Keep the actual drag surface isolated in the middle so edge controls are never part of the hit area. */}
      <div
        className="titlebar-drag-region absolute inset-y-0 z-0"
        style={{
          left: TITLEBAR_LEADING_WIDTH_PX,
          right: TITLEBAR_TRAILING_WIDTH_PX,
        }}
        onDoubleClick={onToggleMaximize}
      />
    </header>
  )
}

function ContentHeader({
  children,
}: {
  children: ReactNode
}) {
  return (
    <header className="flex h-10 shrink-0 items-stretch overflow-hidden border-b border-border bg-background/90 px-3">
      {children}
    </header>
  )
}

type RendererAppShellProps = {
  supportsCustomTitlebar: boolean
  logoSrc: string
  isWindowMaximized: boolean
  isSidebarVisible: boolean
  onSidebarVisibilityChange: (visible: boolean) => void
  shouldCollapseLeftPane: boolean
  canNavigateBack: boolean
  canNavigateForward: boolean
  onNavigateBack: () => void
  onNavigateForward: () => void
  onWindowMinimize: () => void
  onWindowToggleMaximize: () => void
  onWindowClose: () => void
  onActivatePrimaryPane?: () => void
  leftSidebar: ReactNode
  headerContent: ReactNode
  mainContent: ReactNode
  auxiliaryPane?: ReactNode
  sectionHeaderContent?: Partial<Record<ActiveSection, ReactNode>>
  sectionMainContent?: Partial<Record<ActiveSection, ReactNode>>
  sectionAuxiliaryPane?: Partial<Record<ActiveSection, ReactNode | null>>
  dialogs?: ReactNode
}

function RendererAppShellFrame({
  supportsCustomTitlebar,
  logoSrc,
  isWindowMaximized,
  isSidebarVisible,
  onSidebarVisibilityChange,
  shouldCollapseLeftPane,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose,
  onActivatePrimaryPane,
  leftSidebar,
  headerContent,
  mainContent,
  auxiliaryPane,
  sectionHeaderContent,
  sectionMainContent,
  sectionAuxiliaryPane,
}: RendererAppShellProps) {
  const { activeSection } = useSidebarSection()
  const resolvedHeaderContent = sectionHeaderContent?.[activeSection] ?? headerContent
  const resolvedMainContent = sectionMainContent?.[activeSection] ?? mainContent
  const resolvedAuxiliaryPane = sectionAuxiliaryPane?.[activeSection] ?? auxiliaryPane

  return (
    <div
      className="relative flex h-svh w-full overflow-hidden"
      style={supportsCustomTitlebar ? { paddingTop: CUSTOM_TITLEBAR_HEIGHT_PX } : undefined}
    >
      <SidebarProvider
        open={isSidebarVisible}
        onOpenChange={onSidebarVisibilityChange}
        style={{
          "--sidebar-width": `${DEFAULT_SIDEBAR_WIDTH}px`,
        } as CSSProperties}
      >
        <DesktopTitlebar
          isMaximized={isWindowMaximized}
          supportsCustomTitlebar={supportsCustomTitlebar}
          onMinimize={onWindowMinimize}
          onToggleMaximize={onWindowToggleMaximize}
          onClose={onWindowClose}
        />
        <DesktopTitlebarLeadingControls
          logoSrc={logoSrc}
          isSidebarVisible={isSidebarVisible}
          onToggleSidebar={() => onSidebarVisibilityChange(!isSidebarVisible)}
          canNavigateBack={canNavigateBack}
          canNavigateForward={canNavigateForward}
          onNavigateBack={onNavigateBack}
          onNavigateForward={onNavigateForward}
        />
        {leftSidebar}
        <SidebarInset
          className={cn(
            "overflow-hidden! min-h-0 min-w-0 transition-[max-width] duration-200 ease-linear",
            shouldCollapseLeftPane && "pointer-events-none select-none"
          )}
          style={shouldCollapseLeftPane ? { maxWidth: 0 } : { maxWidth: '100%' }}
          aria-hidden={shouldCollapseLeftPane}
          onMouseDownCapture={onActivatePrimaryPane}
          onFocusCapture={onActivatePrimaryPane}
        >
          <ContentHeader>
            {resolvedHeaderContent}
          </ContentHeader>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {resolvedMainContent}
          </div>
        </SidebarInset>
        {resolvedAuxiliaryPane}
      </SidebarProvider>
    </div>
  )
}

export function RendererAppShell(props: RendererAppShellProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarSectionProvider defaultSection="tasks">
        <RendererAppShellFrame {...props} />
        {props.dialogs}
      </SidebarSectionProvider>
      <Toaster />
    </TooltipProvider>
  )
}
