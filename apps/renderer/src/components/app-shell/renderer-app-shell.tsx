import type { CSSProperties, ReactNode } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  MinusIcon,
  PanelLeftIcon,
  SearchIcon,
  SquareIcon,
  SquarePen,
  XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarSectionProvider } from '@/contexts/sidebar-context'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const DEFAULT_SIDEBAR_WIDTH = 256
const MACOS_TRAFFIC_LIGHTS_RESERVED_PX = 16 + 12 * 3 + 8 * 2
const CUSTOM_TITLEBAR_HEIGHT_PX = 40
const TITLEBAR_BUTTON_PX = 32
const TITLEBAR_BUTTON_GAP_PX = 4
const TITLEBAR_HEADER_GAP_PX = 8
const TITLEBAR_TOGGLE_MARGIN_LEFT_PX = 12
const TITLEBAR_BUTTONS_COLLAPSED = 2
const TITLEBAR_BUTTON_GAPS_COLLAPSED = 1

const getCollapsedLeftPaddingPx = (isMac: boolean) =>
  (isMac ? MACOS_TRAFFIC_LIGHTS_RESERVED_PX : 0) +
  TITLEBAR_TOGGLE_MARGIN_LEFT_PX +
  TITLEBAR_BUTTON_PX * TITLEBAR_BUTTONS_COLLAPSED +
  TITLEBAR_BUTTON_GAP_PX * TITLEBAR_BUTTON_GAPS_COLLAPSED +
  TITLEBAR_HEADER_GAP_PX

function FlazzTitlebarBrand({ logoSrc }: { logoSrc: string }) {
  return (
    <div className="titlebar-no-drag flex min-w-0 shrink-0 items-center pl-3 pr-2">
      <img
        src={logoSrc}
        alt="Flazz"
        className="h-5 w-5 shrink-0 object-contain"
        draggable={false}
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
  logoSrc,
  isMaximized,
  supportsCustomTitlebar,
  onToggleMaximize,
  onMinimize,
  onClose,
  onNewChat,
  onOpenSearch,
}: {
  logoSrc: string
  isMaximized: boolean
  supportsCustomTitlebar: boolean
  onToggleMaximize: () => void
  onMinimize: () => void
  onClose: () => void
  onNewChat: () => void
  onOpenSearch: () => void
}) {
  const { toggleSidebar } = useSidebar()

  if (!supportsCustomTitlebar) {
    return null
  }

  return (
    <header
      className="titlebar-drag-region absolute inset-x-0 top-0 z-30 flex h-10 items-stretch border-b border-border bg-sidebar/95 backdrop-blur"
      onDoubleClick={onToggleMaximize}
    >
      <FlazzTitlebarBrand logoSrc={logoSrc} />
      <div className="titlebar-no-drag flex items-center pl-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <PanelLeftIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={onNewChat}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="New chat"
        >
          <SquarePen className="size-5" />
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Search"
        >
          <SearchIcon className="size-5" />
        </button>
      </div>
      <div className="min-w-0 flex-1" />
      <DesktopWindowControls
        isMaximized={isMaximized}
        supportsCustomTitlebar={supportsCustomTitlebar}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />
    </header>
  )
}

function FixedSidebarToggle({
  onNavigateBack,
  onNavigateForward,
  canNavigateBack,
  canNavigateForward,
  isMac,
  topOffsetPx,
}: {
  onNavigateBack: () => void
  onNavigateForward: () => void
  canNavigateBack: boolean
  canNavigateForward: boolean
  isMac: boolean
  topOffsetPx: number
}) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"
  if (!isCollapsed) {
    return null
  }

  return (
    <div
      className="fixed left-0 z-50 flex h-10 items-center"
      style={{ top: topOffsetPx, WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <div
        aria-hidden="true"
        className="h-10 shrink-0"
        style={{ width: isMac ? MACOS_TRAFFIC_LIGHTS_RESERVED_PX : 0 }}
      />
      <button
        type="button"
        onClick={onNavigateBack}
        disabled={!canNavigateBack}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        style={{ marginLeft: TITLEBAR_TOGGLE_MARGIN_LEFT_PX }}
        aria-label="Go back"
      >
        <ChevronLeftIcon className="size-5" />
      </button>
      <button
        type="button"
        onClick={onNavigateForward}
        disabled={!canNavigateForward}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        style={{ marginLeft: TITLEBAR_BUTTON_GAP_PX }}
        aria-label="Go forward"
      >
        <ChevronRightIcon className="size-5" />
      </button>
    </div>
  )
}

function ContentHeader({
  children,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack,
  canNavigateForward,
  collapsedLeftPaddingPx,
}: {
  children: ReactNode
  onNavigateBack: () => void
  onNavigateForward: () => void
  canNavigateBack: boolean
  canNavigateForward: boolean
  collapsedLeftPaddingPx: number
}) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <header
      className={cn(
        "flex h-10 shrink-0 items-stretch overflow-hidden border-b border-border bg-background/90 px-3 transition-[padding] duration-200 ease-linear",
        isCollapsed && "pl-[196px]"
      )}
      style={isCollapsed ? { paddingLeft: collapsedLeftPaddingPx } : undefined}
    >
      {!isCollapsed ? (
        <div className="titlebar-no-drag flex shrink-0 items-center gap-1 pr-2">
          <button
            type="button"
            onClick={onNavigateBack}
            disabled={!canNavigateBack}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="Go back"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={onNavigateForward}
            disabled={!canNavigateForward}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="Go forward"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </div>
      ) : null}
      <div className="titlebar-no-drag self-stretch w-px bg-border/70" aria-hidden="true" />
      {children}
    </header>
  )
}

type RendererAppShellProps = {
  isMac: boolean
  supportsCustomTitlebar: boolean
  logoSrc: string
  isWindowMaximized: boolean
  shouldCollapseLeftPane: boolean
  canNavigateBack: boolean
  canNavigateForward: boolean
  onNavigateBack: () => void
  onNavigateForward: () => void
  onWindowMinimize: () => void
  onWindowToggleMaximize: () => void
  onWindowClose: () => void
  onNewChat: () => void
  onOpenSearch: () => void
  onActivatePrimaryPane?: () => void
  leftSidebar: ReactNode
  headerContent: ReactNode
  mainContent: ReactNode
  auxiliaryPane?: ReactNode
  dialogs?: ReactNode
}

export function RendererAppShell({
  isMac,
  supportsCustomTitlebar,
  logoSrc,
  isWindowMaximized,
  shouldCollapseLeftPane,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose,
  onNewChat,
  onOpenSearch,
  onActivatePrimaryPane,
  leftSidebar,
  headerContent,
  mainContent,
  auxiliaryPane,
  dialogs,
}: RendererAppShellProps) {
  const titlebarTopOffsetPx = supportsCustomTitlebar ? CUSTOM_TITLEBAR_HEIGHT_PX : 0
  const collapsedLeftPaddingPx = getCollapsedLeftPaddingPx(isMac)

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarSectionProvider defaultSection="tasks">
        <div
          className="relative flex h-svh w-full overflow-hidden"
          style={supportsCustomTitlebar ? { paddingTop: CUSTOM_TITLEBAR_HEIGHT_PX } : undefined}
        >
          <SidebarProvider
            style={{
              "--sidebar-width": `${DEFAULT_SIDEBAR_WIDTH}px`,
            } as CSSProperties}
          >
            <DesktopTitlebar
              logoSrc={logoSrc}
              isMaximized={isWindowMaximized}
              supportsCustomTitlebar={supportsCustomTitlebar}
              onMinimize={onWindowMinimize}
              onToggleMaximize={onWindowToggleMaximize}
              onClose={onWindowClose}
              onNewChat={onNewChat}
              onOpenSearch={onOpenSearch}
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
              <ContentHeader
                onNavigateBack={onNavigateBack}
                onNavigateForward={onNavigateForward}
                canNavigateBack={canNavigateBack}
                canNavigateForward={canNavigateForward}
                collapsedLeftPaddingPx={collapsedLeftPaddingPx}
              >
                {headerContent}
              </ContentHeader>
              {mainContent}
            </SidebarInset>
            {auxiliaryPane}
            <FixedSidebarToggle
              onNavigateBack={onNavigateBack}
              onNavigateForward={onNavigateForward}
              canNavigateBack={canNavigateBack}
              canNavigateForward={canNavigateForward}
              isMac={isMac}
              topOffsetPx={titlebarTopOffsetPx}
            />
          </SidebarProvider>
        </div>
        {dialogs}
      </SidebarSectionProvider>
      <Toaster />
    </TooltipProvider>
  )
}
