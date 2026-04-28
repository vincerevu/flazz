"use client"

import * as React from "react"
import { Settings } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useSidebarSection } from "@/contexts/sidebar-context"
import { SettingsDialog } from "@/components/settings-dialog"
import { MainSidebarMenu } from "./main-sidebar-menu"
import { ScheduleSection } from "@/features/schedule/schedule-section"
import type { TreeNode } from "@/features/memory/types"
import {
  SidebarMemorySection,
  type MemoryActions,
} from "@/components/sidebar-memory-section"
import { SidebarSyncStatusBar } from "@/components/sidebar-sync-status-bar"
import {
  SidebarChatSection,
  type SidebarRunListItem,
  type SidebarTasksActions,
} from "@/components/sidebar-chat-section"

type BackgroundTaskItem = {
  name: string
  description?: string
  schedule: {
    type: "cron" | "window" | "once"
    expression?: string
    cron?: string
    startTime?: string
    endTime?: string
    runAt?: string
  }
  enabled: boolean
  status?: "scheduled" | "running" | "finished" | "failed" | "triggered"
  nextRunAt?: string | null
  lastRunAt?: string | null
}

const sidebarUtilityButtonClass =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"

type SidebarContentPanelProps = {
  tree: TreeNode[]
  selectedPath: string | null
  expandedPaths: Set<string>
  onSelectFile: (path: string, kind: "file" | "dir") => void
  memoryActions: MemoryActions
  pendingFolderRenamePath?: string | null
  onPendingFolderRenameHandled?: (path: string | null) => void
  onVoiceNoteCreated?: (path: string) => void
  runs?: SidebarRunListItem[]
  runsLoading?: boolean
  currentRunId?: string | null
  processingRunIds?: Set<string>
  tasksActions?: SidebarTasksActions
  backgroundTasks?: BackgroundTaskItem[]
  selectedBackgroundTask?: string | null
} & React.ComponentProps<typeof Sidebar>

export function SidebarContentPanel({
  tree,
  selectedPath,
  expandedPaths,
  onSelectFile,
  memoryActions,
  pendingFolderRenamePath,
  onPendingFolderRenameHandled,
  onVoiceNoteCreated,
  runs = [],
  runsLoading = false,
  currentRunId,
  processingRunIds,
  tasksActions,
  backgroundTasks = [],
  selectedBackgroundTask,
  ...props
}: SidebarContentPanelProps) {
  const { activeSection, setActiveSection } = useSidebarSection()

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <div className="h-10" />
        <div className="titlebar-no-drag px-2 py-1.5">
          <MainSidebarMenu
            activeSection={activeSection}
            onChange={setActiveSection}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {activeSection === "memory" && (
          <SidebarMemorySection
            tree={tree}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelectFile={onSelectFile}
            actions={memoryActions}
            pendingFolderRenamePath={pendingFolderRenamePath}
            onPendingFolderRenameHandled={onPendingFolderRenameHandled}
            onVoiceNoteCreated={onVoiceNoteCreated}
          />
        )}
        {activeSection === "tasks" && (
          <SidebarChatSection
            runs={runs}
            isLoading={runsLoading}
            currentRunId={currentRunId}
            processingRunIds={processingRunIds}
            actions={tasksActions}
          />
        )}
        {activeSection === "schedule" && (
          <ScheduleSection />
        )}
      </SidebarContent>
      {/* Bottom actions */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <div className="flex flex-col gap-1">
          <SettingsDialog>
            <button className={sidebarUtilityButtonClass}>
              <Settings className="size-4" />
              <span>Settings</span>
            </button>
          </SettingsDialog>
        </div>
      </div>
      <SidebarSyncStatusBar />
      <SidebarRail />
    </Sidebar>
  )
}

