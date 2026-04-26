import * as React from "react"
import { useCallback } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"

import type { ActiveFilter, NoteEntry, SortDir } from "./memory-collection-types"

type MemoryCollectionTableProps = {
  pageNotes: NoteEntry[]
  visibleColumns: string[]
  filters: ActiveFilter[]
  sort: { field: string; dir: SortDir }
  sortedNotesCount: number
  clampedPage: number
  totalPages: number
  pageSize: number
  getColumnWidth: (column: string) => number
  getColumnLabel: (column: string) => string
  onResizeStart: (column: string, event: React.MouseEvent) => void
  onSort: (field: string) => void
  onSelectNote: (path: string) => void
  toggleFilter: (category: string, value: string) => void
  onPreviousPage: () => void
  onNextPage: () => void
}

export function MemoryCollectionTable({
  pageNotes,
  visibleColumns,
  filters,
  sort,
  sortedNotesCount,
  clampedPage,
  totalPages,
  pageSize,
  getColumnWidth,
  getColumnLabel,
  onResizeStart,
  onSort,
  onSelectNote,
  toggleFilter,
  onPreviousPage,
  onNextPage,
}: MemoryCollectionTableProps) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column} style={{ width: getColumnWidth(column) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border bg-background">
            <tr>
              {visibleColumns.map((column) => (
                <th
                  key={column}
                  className="group relative cursor-pointer select-none px-4 py-2 text-left font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => onSort(column)}
                >
                  <span className="block truncate">
                    {getColumnLabel(column)}
                    <SortIcon
                      activeField={sort.field}
                      direction={sort.dir}
                      field={column}
                    />
                  </span>
                  <div
                    className="absolute bottom-0 right-0 top-0 w-1.5 cursor-col-resize bg-border/60 opacity-0 group-hover:opacity-100 hover:!opacity-100"
                    onMouseDown={(event) => onResizeStart(column, event)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageNotes.map((note) => (
              <NoteRow
                key={note.path}
                note={note}
                visibleColumns={visibleColumns}
                filters={filters}
                onSelectNote={onSelectNote}
                toggleFilter={toggleFilter}
              />
            ))}
            {pageNotes.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No notes found
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {sortedNotesCount === 0
            ? "0 notes"
            : `${clampedPage * pageSize + 1}-${Math.min(
                (clampedPage + 1) * pageSize,
                sortedNotesCount,
              )} of ${sortedNotesCount}`}
        </span>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <button
              disabled={clampedPage === 0}
              onClick={onPreviousPage}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 text-xs text-muted-foreground">
              Page {clampedPage + 1} of {totalPages}
            </span>
            <button
              disabled={clampedPage >= totalPages - 1}
              onClick={onNextPage}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}

function SortIcon({
  activeField,
  direction,
  field,
}: {
  activeField: string
  direction: SortDir
  field: string
}) {
  if (activeField !== field) return null
  return direction === "asc" ? (
    <ArrowUp className="ml-1 inline size-3" />
  ) : (
    <ArrowDown className="ml-1 inline size-3" />
  )
}

function NoteRow({
  note,
  visibleColumns,
  filters,
  onSelectNote,
  toggleFilter,
}: {
  note: NoteEntry
  visibleColumns: string[]
  filters: ActiveFilter[]
  onSelectNote: (path: string) => void
  toggleFilter: (category: string, value: string) => void
}) {
  const handleCopyPath = useCallback(async () => {
    await navigator.clipboard.writeText(note.path)
  }, [note.path])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr
          className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/50"
          onClick={() => onSelectNote(note.path)}
        >
          {visibleColumns.map((column) => (
            <td key={column} className="overflow-hidden px-4 py-2">
              <CellRenderer
                note={note}
                column={column}
                filters={filters}
                toggleFilter={toggleFilter}
              />
            </td>
          ))}
        </tr>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onSelectNote(note.path)}>
          <Pencil className="mr-2 size-4" />
          Open note
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void handleCopyPath()}>
          <Copy className="mr-2 size-4" />
          Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>
          <Trash2 className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function CellRenderer({
  note,
  column,
  filters,
  toggleFilter,
}: {
  note: NoteEntry
  column: string
  filters: ActiveFilter[]
  toggleFilter: (category: string, value: string) => void
}) {
  if (column === "name") {
    return <span className="block truncate font-medium">{note.name}</span>
  }
  if (column === "folder") {
    return <span className="block truncate text-muted-foreground">{note.folder}</span>
  }
  if (column === "mtimeMs") {
    return (
      <span className="block truncate whitespace-nowrap text-muted-foreground">
        {formatDate(note.mtimeMs)}
      </span>
    )
  }

  const value = note.fields[column]
  if (!value) return null

  if (column === "last_update" || column === "first_met") {
    const next = Array.isArray(value) ? value[0] ?? "" : value
    const ms = Date.parse(next)
    return (
      <span className="block truncate whitespace-nowrap text-muted-foreground">
        {Number.isNaN(ms) ? next : formatDate(ms)}
      </span>
    )
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {value.map((entry) => (
          <CategoryBadge
            key={entry}
            category={column}
            value={entry}
            active={hasFilter(filters, { category: column, value: entry })}
            onClick={toggleFilter}
          />
        ))}
      </div>
    )
  }

  return (
    <CategoryBadge
      category={column}
      value={value}
      active={hasFilter(filters, { category: column, value })}
      onClick={toggleFilter}
    />
  )
}

function CategoryBadge({
  category,
  value,
  active,
  onClick,
}: {
  category: string
  value: string
  active: boolean
  onClick: (category: string, value: string) => void
}) {
  return (
    <Badge
      variant={active ? "default" : "secondary"}
      className={cn(
        "cursor-pointer px-1.5 py-0 text-[10px]",
        !active && "hover:bg-primary hover:text-primary-foreground",
      )}
      onClick={(event) => {
        event.stopPropagation()
        onClick(category, value)
      }}
    >
      {value}
    </Badge>
  )
}

function formatDate(ms: number): string {
  if (!ms) return ""
  return new Date(ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function filtersEqual(a: ActiveFilter, b: ActiveFilter): boolean {
  return a.category === b.category && a.value === b.value
}

function hasFilter(filters: ActiveFilter[], next: ActiveFilter): boolean {
  return filters.some((filter) => filtersEqual(filter, next))
}
