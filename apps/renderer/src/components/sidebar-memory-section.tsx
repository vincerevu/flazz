"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FilePlus,
  Folder,
  FolderPlus,
  Network,
  Pencil,
  Trash2,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SidebarVoiceNoteButton } from "@/components/sidebar-voice-note-button"
import type { TreeNode } from "@/features/memory/types"
import { toast } from "@/lib/toast"

export type MemoryActions = {
  createNote: (parentPath?: string) => void
  createFolder: (
    parentPath?: string,
  ) => Promise<string | null | undefined> | string | null | undefined
  openGraph: () => void
  expandAll: () => void
  collapseAll: () => void
  rename: (path: string, newName: string, isDir: boolean) => Promise<void>
  remove: (path: string) => Promise<void>
  copyPath: (path: string) => void
  onOpenInNewTab?: (path: string) => void
}

type SidebarMemorySectionProps = {
  tree: TreeNode[]
  selectedPath: string | null
  expandedPaths: Set<string>
  onSelectFile: (path: string, kind: "file" | "dir") => void
  actions: MemoryActions
  pendingFolderRenamePath?: string | null
  onPendingFolderRenameHandled?: (path: string | null) => void
  onVoiceNoteCreated?: (path: string) => void
}

export function SidebarMemorySection({
  tree,
  selectedPath,
  expandedPaths,
  onSelectFile,
  actions,
  pendingFolderRenamePath,
  onPendingFolderRenameHandled,
  onVoiceNoteCreated,
}: SidebarMemorySectionProps) {
  const isExpanded = expandedPaths.size > 0
  const treeContainerRef = React.useRef<HTMLDivElement | null>(null)
  const visibleTree = React.useMemo(
    () =>
      flattenKnowledgeFolders(
        tree.filter(
          (node) =>
            node.path !== "memory/Runs" &&
            node.path !== "memory/Workflows" &&
            node.path !== "memory/Signals" &&
            node.path !== "memory/Sources",
        ),
      ),
    [tree],
  )

  useEffect(() => {
    if (!selectedPath) return

    let cancelled = false
    let rafId: number | null = null
    let attempts = 0
    const maxAttempts = 20

    const revealActiveFile = () => {
      if (cancelled) return
      const container = treeContainerRef.current
      if (!container) return
      const activeRow = container.querySelector<HTMLElement>(
        '[data-memory-active="true"]',
      )
      if (activeRow) {
        activeRow.scrollIntoView({ block: "nearest", inline: "nearest" })
        return
      }
      if (attempts >= maxAttempts) return
      attempts += 1
      rafId = requestAnimationFrame(revealActiveFile)
    }

    rafId = requestAnimationFrame(revealActiveFile)
    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [selectedPath, expandedPaths, visibleTree])

  const quickActions = [
    { icon: FilePlus, label: "New Note", action: () => actions.createNote() },
    {
      icon: FolderPlus,
      label: "New Folder",
      action: () => actions.createFolder(),
    },
    { icon: Network, label: "Graph View", action: () => actions.openGraph() },
  ]

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarGroup className="flex flex-1 flex-col overflow-hidden">
          <div className="sticky top-0 z-10 flex items-center justify-center gap-1 border-b border-sidebar-border bg-sidebar py-1">
            {quickActions.map((action) => (
              <Tooltip key={action.label}>
                <TooltipTrigger asChild>
                  <button
                    onClick={action.action}
                    className="rounded p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <action.icon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{action.label}</TooltipContent>
              </Tooltip>
            ))}
            <SidebarVoiceNoteButton onNoteCreated={onVoiceNoteCreated} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={isExpanded ? actions.collapseAll : actions.expandAll}
                  className="rounded p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  {isExpanded ? (
                    <ChevronsDownUp className="size-4" />
                  ) : (
                    <ChevronsUpDown className="size-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isExpanded ? "Collapse All" : "Expand All"}
              </TooltipContent>
            </Tooltip>
          </div>
          <SidebarGroupContent className="flex-1 overflow-y-auto">
            <div ref={treeContainerRef}>
              <SidebarMenu>
                {visibleTree.map((item, index) => (
                  <MemoryTreeItem
                    key={index}
                    item={item}
                    selectedPath={selectedPath}
                    expandedPaths={expandedPaths}
                    onSelect={onSelectFile}
                    actions={actions}
                    autoRenamePath={pendingFolderRenamePath}
                    onAutoRenameHandled={onPendingFolderRenameHandled}
                  />
                ))}
              </SidebarMenu>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => actions.createNote()}>
          <FilePlus className="mr-2 size-4" />
          New Note
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.createFolder()}>
          <FolderPlus className="mr-2 size-4" />
          New Folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function countFiles(node: TreeNode): number {
  if (node.kind === "file") return 1
  return (node.children ?? []).reduce((sum, child) => sum + countFiles(child), 0)
}

const FOLDER_DISPLAY_NAMES: Record<string, string> = {
  Notes: "My Notes",
  Workflows: "Workflow Memory",
}

function flattenKnowledgeFolders(nodes: TreeNode[]): TreeNode[] {
  const visible: TreeNode[] = []
  for (const node of nodes) {
    if (node.path === "memory/Knowledge") {
      visible.push(...(node.children ?? []))
      continue
    }
    visible.push(node)
  }
  return visible
}

type MemoryTreeItemProps = {
  item: TreeNode
  selectedPath: string | null
  expandedPaths: Set<string>
  onSelect: (path: string, kind: "file" | "dir") => void
  actions: MemoryActions
  autoRenamePath?: string | null
  onAutoRenameHandled?: (path: string | null) => void
}

function MemoryTreeItem({
  item,
  selectedPath,
  expandedPaths,
  onSelect,
  actions,
  autoRenamePath,
  onAutoRenameHandled,
}: MemoryTreeItemProps) {
  const isDir = item.kind === "dir"
  const isExpanded = expandedPaths.has(item.path)
  const isSelected = selectedPath === item.path
  const [isRenaming, setIsRenaming] = useState(false)
  const isSubmittingRef = React.useRef(false)
  const displayName = (isDir && FOLDER_DISPLAY_NAMES[item.name]) || item.name

  const baseName =
    !isDir && item.name.endsWith(".md") ? item.name.slice(0, -3) : item.name
  const [newName, setNewName] = useState(baseName)
  const isTemporaryFolder = isDir && item.name.startsWith("new-folder")

  React.useEffect(() => {
    setNewName(baseName)
  }, [baseName])

  React.useEffect(() => {
    if (autoRenamePath !== item.path || isRenaming) return
    setNewName(baseName)
    isSubmittingRef.current = false
    setIsRenaming(true)
    onAutoRenameHandled?.(null)
  }, [autoRenamePath, baseName, isRenaming, item.path, onAutoRenameHandled])

  const handleRename = async () => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    const trimmedName = newName.trim()
    if (isTemporaryFolder && (!trimmedName || trimmedName === baseName)) {
      try {
        await actions.remove(item.path)
      } catch {
        toast("Failed to remove empty folder", "error")
      }
      setIsRenaming(false)
      setTimeout(() => {
        isSubmittingRef.current = false
      }, 100)
      return
    }

    if (trimmedName && trimmedName !== baseName) {
      try {
        await actions.rename(item.path, trimmedName, isDir)
        toast("Renamed successfully", "success")
      } catch {
        toast("Failed to rename", "error")
      }
    }
    setIsRenaming(false)
    setTimeout(() => {
      isSubmittingRef.current = false
    }, 100)
  }

  const handleDelete = async () => {
    try {
      await actions.remove(item.path)
      toast("Moved to trash", "success")
    } catch {
      toast("Failed to delete", "error")
    }
  }

  const handleCopyPath = () => {
    actions.copyPath(item.path)
    toast("Path copied", "success")
  }

  const cancelRename = () => {
    isSubmittingRef.current = true
    setIsRenaming(false)
    setNewName(baseName)
    if (isTemporaryFolder) {
      void actions
        .remove(item.path)
        .catch(() => {
          toast("Failed to remove empty folder", "error")
        })
        .finally(() => {
          setTimeout(() => {
            isSubmittingRef.current = false
          }, 100)
        })
      return
    }
    setTimeout(() => {
      isSubmittingRef.current = false
    }, 100)
  }

  const contextMenuContent = (
    <ContextMenuContent className="w-48">
      {isDir && (
        <>
          <ContextMenuItem onClick={() => actions.createNote(item.path)}>
            <FilePlus className="mr-2 size-4" />
            New Note
          </ContextMenuItem>
          <ContextMenuItem onClick={() => actions.createFolder(item.path)}>
            <FolderPlus className="mr-2 size-4" />
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {!isDir && actions.onOpenInNewTab && (
        <>
          <ContextMenuItem onClick={() => actions.onOpenInNewTab?.(item.path)}>
            <ExternalLink className="mr-2 size-4" />
            Open in new tab
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={handleCopyPath}>
        <Copy className="mr-2 size-4" />
        Copy Path
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => {
          setNewName(baseName)
          isSubmittingRef.current = false
          setIsRenaming(true)
        }}
      >
        <Pencil className="mr-2 size-4" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onClick={handleDelete}>
        <Trash2 className="mr-2 size-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  )

  if (isRenaming) {
    return (
      <SidebarMenuItem>
        <div className="flex items-center px-2 py-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={async (e) => {
              e.stopPropagation()
              if (e.key === "Enter") {
                e.preventDefault()
                await handleRename()
              } else if (e.key === "Escape") {
                e.preventDefault()
                cancelRename()
              }
            }}
            onBlur={() => {
              if (!isSubmittingRef.current) {
                void handleRename()
              }
            }}
            className="h-6 flex-1 text-sm"
            autoFocus
          />
        </div>
      </SidebarMenuItem>
    )
  }

  if (!isDir) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuItem
            className="group/file-item"
            data-memory-file-path={item.path}
            data-memory-active={isSelected ? "true" : "false"}
          >
            <SidebarMenuButton
              isActive={isSelected}
              onClick={(e) => {
                if (e.metaKey && actions.onOpenInNewTab) {
                  actions.onOpenInNewTab(item.path)
                } else {
                  onSelect(item.path, item.kind)
                }
              }}
            >
              <div className="flex min-w-0 w-full items-center gap-1">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </ContextMenuTrigger>
        {contextMenuContent}
      </ContextMenu>
    )
  }

  const parts = item.path.split("/")
  const isTopLevelMemoryFolder =
    isDir &&
    ((parts.length === 2 && parts[0] === "memory") ||
      (parts.length === 3 &&
        parts[0] === "memory" &&
        parts[1] === "Knowledge"))

  if (isTopLevelMemoryFolder) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isSelected}
              onClick={() => onSelect(item.path, item.kind)}
              className="data-[active=true]:font-normal"
            >
              <Folder className="size-4 shrink-0" />
              <div className="flex min-w-0 w-full items-center gap-1">
                <span className="min-w-0 flex-1 truncate">{displayName}</span>
                <span className="shrink-0 text-xs tabular-nums text-sidebar-foreground/50">
                  {countFiles(item)}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </ContextMenuTrigger>
        {contextMenuContent}
      </ContextMenu>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <Collapsible
            open={isExpanded}
            onOpenChange={() => onSelect(item.path, item.kind)}
            className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
          >
            <CollapsibleTrigger asChild>
              <SidebarMenuButton>
                <ChevronRight className="size-4 transition-transform" />
                <div className="flex min-w-0 w-full items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">{displayName}</span>
                  <span className="shrink-0 text-xs tabular-nums text-sidebar-foreground/50">
                    {countFiles(item)}
                  </span>
                </div>
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {(item.children ?? []).map((subItem, index) => (
                  <MemoryTreeItem
                    key={index}
                    item={subItem}
                    selectedPath={selectedPath}
                    expandedPaths={expandedPaths}
                    onSelect={onSelect}
                    actions={actions}
                    autoRenamePath={autoRenamePath}
                    onAutoRenameHandled={onAutoRenameHandled}
                  />
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
        </SidebarMenuItem>
      </ContextMenuTrigger>
      {contextMenuContent}
    </ContextMenu>
  )
}
