import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  ListFilter,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { extractAllFrontmatterValues, splitFrontmatter } from '@/lib/frontmatter'
import { useDebounce } from '@/hooks/use-debounce'
import { searchIpc } from '@/services/search-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'
import type { TreeNode } from '@/features/memory/types'
import { getMemoryCollectionMeta, type MemoryCollectionPath } from '@/features/memory/utils/collections'

type NoteEntry = {
  path: string
  name: string
  folder: string
  fields: Record<string, string | string[]>
  mtimeMs: number
}

type SortDir = 'asc' | 'desc'
type ActiveFilter = { category: string; value: string }

type BaseConfig = {
  name: string
  visibleColumns: string[]
  columnWidths: Record<string, number>
  sort: { field: string; dir: SortDir }
  filters: ActiveFilter[]
}

const DEFAULT_BASE_CONFIG: BaseConfig = {
  name: 'All Notes',
  visibleColumns: ['name', 'folder', 'relationship', 'topic', 'status', 'mtimeMs'],
  columnWidths: {},
  sort: { field: 'mtimeMs', dir: 'desc' },
  filters: [],
}

const PAGE_SIZE = 25
const BUILTIN_COLUMNS = ['name', 'folder', 'mtimeMs'] as const
type BuiltinColumn = (typeof BUILTIN_COLUMNS)[number]

const BUILTIN_LABELS: Record<BuiltinColumn, string> = {
  name: 'Name',
  folder: 'Folder',
  mtimeMs: 'Last Modified',
}

const DEFAULT_WIDTHS: Record<string, number> = {
  name: 220,
  folder: 160,
  mtimeMs: 150,
}
const DEFAULT_FRONTMATTER_WIDTH = 150

function toTitleCase(key: string): string {
  if (key in BUILTIN_LABELS) return BUILTIN_LABELS[key as BuiltinColumn]
  return key
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function collectFiles(nodes: TreeNode[]): { path: string; name: string; mtimeMs: number }[] {
  return nodes.flatMap((node) =>
    node.kind === 'file' && node.name.endsWith('.md')
      ? [{ path: node.path, name: node.name.replace(/\.md$/i, ''), mtimeMs: node.stat?.mtimeMs ?? 0 }]
      : node.children
        ? collectFiles(node.children)
        : [],
  )
}

function findNode(nodes: TreeNode[], targetPath: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children?.length) {
      const match = findNode(node.children, targetPath)
      if (match) return match
    }
  }
  return null
}

function getFolder(path: string, collectionPath: string): string {
  const relative = path.slice(collectionPath.length).replace(/^\/+/, '')
  const parts = relative.split('/').filter(Boolean)
  if (parts.length <= 1) return 'Root'
  return parts.slice(0, -1).join('/')
}

function formatDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function filtersEqual(a: ActiveFilter, b: ActiveFilter): boolean {
  return a.category === b.category && a.value === b.value
}

function hasFilter(filters: ActiveFilter[], next: ActiveFilter): boolean {
  return filters.some((filter) => filtersEqual(filter, next))
}

function getColumnValues(note: NoteEntry, column: string): string[] {
  if (column === 'name') return [note.name]
  if (column === 'folder') return [note.folder]
  if (column === 'mtimeMs') return []
  const value = note.fields[column]
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function getSortValue(note: NoteEntry, column: string): string | number {
  if (column === 'name') return note.name
  if (column === 'folder') return note.folder
  if (column === 'mtimeMs') return note.mtimeMs
  const value = note.fields[column]
  if (!value) return ''
  if (column === 'last_update' || column === 'first_met') {
    const next = Array.isArray(value) ? value[0] ?? '' : value
    const ms = Date.parse(next)
    return Number.isNaN(ms) ? 0 : ms
  }
  return Array.isArray(value) ? value[0] ?? '' : value
}

export function MemoryCollectionView({
  collectionPath,
  tree,
  onSelectNote,
  onCreateNote,
}: {
  collectionPath: MemoryCollectionPath
  tree: TreeNode[]
  onSelectNote: (path: string) => void
  onCreateNote: (path: string) => void
}) {
  const collection = getMemoryCollectionMeta(collectionPath)
  const collectionNode = useMemo(() => findNode(tree, collectionPath), [tree, collectionPath])
  const notes = useMemo<NoteEntry[]>(() => {
    const source = collectionNode?.children ?? []
    return collectFiles(source).map((file) => ({
      path: file.path,
      name: file.name,
      folder: getFolder(file.path, collectionPath),
      fields: {},
      mtimeMs: file.mtimeMs,
    }))
  }, [collectionNode, collectionPath])

  const [fieldsByPath, setFieldsByPath] = useState<Map<string, Record<string, string | string[]>>>(new Map())
  const [config, setConfig] = useState<BaseConfig>(DEFAULT_BASE_CONFIG)
  const [page, setPage] = useState(0)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchPaths, setSearchMatchPaths] = useState<Set<string> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const saveInputRef = useRef<HTMLInputElement>(null)
  const loadGenRef = useRef(0)
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    const generation = ++loadGenRef.current
    let cancelled = false
    setFieldsByPath(new Map())

    async function load() {
      const batchSize = 30
      const paths = notes.map((note) => note.path)
      for (let index = 0; index < paths.length; index += batchSize) {
        if (cancelled) return
        const batch = paths.slice(index, index + batchSize)
        const results = await Promise.all(
          batch.map(async (path) => {
            try {
              const result = await workspaceIpc.readFile(path, 'utf8')
              const { raw } = splitFrontmatter(result.data)
              return { path, fields: extractAllFrontmatterValues(raw) }
            } catch {
              return { path, fields: {} as Record<string, string | string[]> }
            }
          }),
        )

        if (cancelled || generation !== loadGenRef.current) return

        setFieldsByPath((prev) => {
          const next = new Map(prev)
          for (const result of results) next.set(result.path, result.fields)
          return next
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [notes])

  const enrichedNotes = useMemo(() => (
    notes.map((note) => ({
      ...note,
      fields: fieldsByPath.get(note.path) ?? {},
    }))
  ), [notes, fieldsByPath])

  const allPropertyKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const fields of fieldsByPath.values()) {
      for (const key of Object.keys(fields)) keys.add(key)
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b))
  }, [fieldsByPath])

  const filterCategories = useMemo(() => ['folder', ...allPropertyKeys], [allPropertyKeys])
  const visibleColumns = config.visibleColumns
  const debouncedSearch = useDebounce(searchQuery, 250)

  const valuesByCategory = useMemo<Record<string, string[]>>(() => {
    const result: Record<string, Set<string>> = {}
    for (const category of filterCategories) result[category] = new Set()

    for (const note of enrichedNotes) {
      for (const category of filterCategories) {
        for (const value of getColumnValues(note, category)) {
          if (value) result[category]?.add(value)
        }
      }
    }

    return Object.fromEntries(
      Object.entries(result).map(([category, values]) => [
        category,
        Array.from(values).sort((a, b) => a.localeCompare(b)),
      ]),
    )
  }, [enrichedNotes, filterCategories])

  useEffect(() => {
    if (!searchOpen || !debouncedSearch.trim()) {
      setSearchMatchPaths(null)
      return
    }
    let cancelled = false
    searchIpc
      .query(debouncedSearch, 200, ['memory'])
      .then((result) => {
        if (!cancelled) {
          const withinCollection = result.results
            .map((entry) => entry.path)
            .filter((path) => path === collectionPath || path.startsWith(`${collectionPath}/`))
          setSearchMatchPaths(new Set(withinCollection))
        }
      })
      .catch(() => {
        if (!cancelled) setSearchMatchPaths(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [collectionPath, debouncedSearch, searchOpen])

  useEffect(() => {
    setPage(0)
  }, [config.filters, searchMatchPaths])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (saveDialogOpen) saveInputRef.current?.focus()
  }, [saveDialogOpen])

  const filteredNotes = useMemo(() => {
    let result = enrichedNotes

    if (searchMatchPaths) {
      result = result.filter((note) => searchMatchPaths.has(note.path))
    }

    if (config.filters.length > 0) {
      const filtersByCategory = new Map<string, string[]>()
      for (const filter of config.filters) {
        const next = filtersByCategory.get(filter.category) ?? []
        next.push(filter.value)
        filtersByCategory.set(filter.category, next)
      }
      result = result.filter((note) => {
        for (const [category, requiredValues] of filtersByCategory) {
          const noteValues = getColumnValues(note, category)
          if (!requiredValues.some((value) => noteValues.includes(value))) return false
        }
        return true
      })
    }

    return result
  }, [config.filters, enrichedNotes, searchMatchPaths])

  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((left, right) => {
      const leftValue = getSortValue(left, config.sort.field)
      const rightValue = getSortValue(right, config.sort.field)
      let compare = 0
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        compare = leftValue - rightValue
      } else {
        compare = String(leftValue).localeCompare(String(rightValue))
      }
      return config.sort.dir === 'asc' ? compare : -compare
    })
  }, [config.sort.dir, config.sort.field, filteredNotes])

  const totalPages = Math.max(1, Math.ceil(sortedNotes.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const pageNotes = useMemo(
    () => sortedNotes.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE),
    [clampedPage, sortedNotes],
  )

  const toggleColumn = useCallback((column: string) => {
    const current = configRef.current
    const nextColumns = current.visibleColumns.includes(column)
      ? current.visibleColumns.filter((entry) => entry !== column)
      : [...current.visibleColumns, column]
    setConfig({ ...current, visibleColumns: nextColumns })
  }, [])

  const toggleFilter = useCallback((category: string, value: string) => {
    const current = configRef.current
    const next = { category, value }
    const filters = hasFilter(current.filters, next)
      ? current.filters.filter((filter) => !filtersEqual(filter, next))
      : [...current.filters, next]
    setConfig({ ...current, filters })
  }, [])

  const clearFilters = useCallback(() => {
    setConfig((prev) => ({ ...prev, filters: [] }))
  }, [])

  const handleSort = useCallback((field: string) => {
    const current = configRef.current
    if (field === current.sort.field) {
      setConfig({
        ...current,
        sort: { field, dir: current.sort.dir === 'asc' ? 'desc' : 'asc' },
      })
      return
    }
    setConfig({
      ...current,
      sort: { field, dir: field === 'mtimeMs' ? 'desc' : 'asc' },
    })
  }, [])

  const getColumnWidth = useCallback((column: string) => {
    return config.columnWidths[column] ?? DEFAULT_WIDTHS[column] ?? DEFAULT_FRONTMATTER_WIDTH
  }, [config.columnWidths])

  const onResizeStart = useCallback((column: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = configRef.current.columnWidths[column] ?? DEFAULT_WIDTHS[column] ?? DEFAULT_FRONTMATTER_WIDTH

    const onMouseMove = (nextEvent: MouseEvent) => {
      const delta = nextEvent.clientX - startX
      const width = Math.max(60, startWidth + delta)
      setConfig((prev) => ({
        ...prev,
        columnWidths: { ...prev.columnWidths, [column]: width },
      }))
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearchQuery('')
        setSearchMatchPaths(null)
      }
      return !prev
    })
  }, [])

  const handleSave = useCallback(() => {
    setSaveName(collection?.label ?? 'Base')
    setSaveDialogOpen(true)
  }, [collection?.label])

  const handleSaveConfirm = useCallback(() => {
    setSaveDialogOpen(false)
  }, [])

  const SortIcon = ({ field }: { field: string }) => {
    if (config.sort.field !== field) return null
    return config.sort.dir === 'asc'
      ? <ArrowUp className="ml-1 inline size-3" />
      : <ArrowDown className="ml-1 inline size-3" />
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ListFilter className="size-3.5" />
                Properties
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-0">
              <Command>
                <CommandInput placeholder="Search properties..." />
                <CommandList>
                  <CommandEmpty>No properties found.</CommandEmpty>
                  <CommandGroup heading="Built-in">
                    {BUILTIN_COLUMNS.map((column) => (
                      <CommandItem key={column} onSelect={() => toggleColumn(column)}>
                        <Check className={cn('mr-2 size-3.5', visibleColumns.includes(column) ? 'opacity-100' : 'opacity-0')} />
                        {BUILTIN_LABELS[column]}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Frontmatter">
                    {allPropertyKeys.map((key) => (
                      <CommandItem key={key} onSelect={() => toggleColumn(key)}>
                        <Check className={cn('mr-2 size-3.5', visibleColumns.includes(key) ? 'opacity-100' : 'opacity-0')} />
                        {toTitleCase(key)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover onOpenChange={(open) => { if (!open) setFilterCategory(null) }}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground',
                  config.filters.length > 0 && 'text-foreground',
                )}
              >
                <Filter className="size-3.5" />
                Filter
                {config.filters.length > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium leading-tight text-primary-foreground">
                    {config.filters.length}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className={cn('p-0', filterCategory ? 'w-[420px]' : 'w-[200px]')}>
              <div className="flex h-[300px]">
                <div className={cn('overflow-auto', filterCategory ? 'w-[160px] border-r border-border' : 'flex-1')}>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Attributes</span>
                    {config.filters.length > 0 ? (
                      <button onClick={clearFilters} className="text-[10px] text-muted-foreground hover:text-foreground">
                        Reset
                      </button>
                    ) : null}
                  </div>
                  {filterCategories.map((category) => {
                    const activeCount = config.filters.filter((filter) => filter.category === category).length
                    const isSelected = filterCategory === category
                    return (
                      <button
                        key={category}
                        onClick={() => setFilterCategory(category)}
                        className={cn(
                          'flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                          isSelected ? 'bg-accent text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        <span className="flex-1 truncate">{toTitleCase(category)}</span>
                        {activeCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-medium leading-tight text-primary-foreground">
                            {activeCount}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                {filterCategory ? (
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Command className="flex flex-1 flex-col">
                      <CommandInput placeholder={`Search ${toTitleCase(filterCategory).toLowerCase()}...`} />
                      <CommandList className="max-h-none flex-1 overflow-auto">
                        <CommandEmpty>No values found.</CommandEmpty>
                        <CommandGroup>
                          {(valuesByCategory[filterCategory] ?? []).map((value) => {
                            const active = hasFilter(config.filters, { category: filterCategory, value })
                            return (
                              <CommandItem key={value} onSelect={() => toggleFilter(filterCategory, value)}>
                                <Check className={cn('mr-2 size-3.5 shrink-0', active ? 'opacity-100' : 'opacity-0')} />
                                <span className="truncate">{value}</span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={toggleSearch}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground',
              searchOpen && 'text-foreground',
            )}
          >
            <Search className="size-3.5" />
            Search
          </button>

          {searchOpen ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search notes..."
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {searchQuery ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {searchMatchPaths ? `${searchMatchPaths.size} matches` : '...'}
                </span>
              ) : null}
              <button onClick={toggleSearch} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="size-3" />
              </button>
            </div>
          ) : null}

          <div className="flex-1" />

          <button
            onClick={handleSave}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Save className="size-3.5" />
            Save As
          </button>

          <Button size="sm" onClick={() => onCreateNote(collectionPath)}>
            New note
          </Button>
        </div>
      </div>

      {config.filters.length > 0 ? (
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">
              {sortedNotes.length} of {enrichedNotes.length} notes
            </span>
            {config.filters.map((filter) => (
              <button
                key={`${filter.category}:${filter.value}`}
                onClick={() => toggleFilter(filter.category, filter.value)}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground"
              >
                <span className="text-primary-foreground/60">{filter.category}:</span>
                {filter.value}
                <X className="size-3" />
              </button>
            ))}
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground">
              Clear all
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
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
                  onClick={() => handleSort(column)}
                >
                  <span className="block truncate">
                    {toTitleCase(column)}
                    <SortIcon field={column} />
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
                filters={config.filters}
                onSelectNote={onSelectNote}
                toggleFilter={toggleFilter}
              />
            ))}
            {pageNotes.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-muted-foreground">
                  No notes found
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {sortedNotes.length === 0
            ? '0 notes'
            : `${clampedPage * PAGE_SIZE + 1}-${Math.min((clampedPage + 1) * PAGE_SIZE, sortedNotes.length)} of ${sortedNotes.length}`}
        </span>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <button
              disabled={clampedPage === 0}
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 text-xs text-muted-foreground">
              Page {clampedPage + 1} of {totalPages}
            </span>
            <button
              disabled={clampedPage >= totalPages - 1}
              onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Save Base</DialogTitle>
            <DialogDescription>Choose a name for this base view.</DialogDescription>
          </DialogHeader>
          <input
            ref={saveInputRef}
            type="text"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') handleSaveConfirm() }}
            placeholder="e.g. Contacts, Projects..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <DialogFooter>
            <button
              onClick={() => setSaveDialogOpen(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveConfirm}
              disabled={!saveName.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  if (column === 'name') {
    return <span className="block truncate font-medium">{note.name}</span>
  }
  if (column === 'folder') {
    return <span className="block truncate text-muted-foreground">{note.folder}</span>
  }
  if (column === 'mtimeMs') {
    return <span className="block truncate whitespace-nowrap text-muted-foreground">{formatDate(note.mtimeMs)}</span>
  }

  const value = note.fields[column]
  if (!value) return null

  if (column === 'last_update' || column === 'first_met') {
    const next = Array.isArray(value) ? value[0] ?? '' : value
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
      variant={active ? 'default' : 'secondary'}
      className={cn(
        'cursor-pointer px-1.5 py-0 text-[10px]',
        !active && 'hover:bg-primary hover:text-primary-foreground',
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
