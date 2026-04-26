import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { extractAllFrontmatterValues, splitFrontmatter } from '@/lib/frontmatter'
import { useDebounce } from '@/hooks/use-debounce'
import { searchIpc } from '@/services/search-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'
import type { TreeNode } from '@/features/memory/types'
import { getMemoryCollectionMeta, type MemoryCollectionPath } from '@/features/memory/utils/collections'
import { MemoryCollectionControls } from '@/features/memory/components/memory-collection-controls'
import { MemoryCollectionSaveDialog } from '@/features/memory/components/memory-collection-save-dialog'
import { MemoryCollectionTable } from '@/features/memory/components/memory-collection-table'
import type { ActiveFilter, NoteEntry, SortDir } from '@/features/memory/components/memory-collection-types'

function getDisplayNoteName(path: string, fileName: string): string {
  const baseName = fileName.replace(/\.md$/i, '')
  if (/^skill$/i.test(baseName)) {
    const parts = path.split('/').filter(Boolean)
    return parts[parts.length - 2] || baseName
  }
  return baseName
}

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
      ? [{ path: node.path, name: getDisplayNoteName(node.path, node.name), mtimeMs: node.stat?.mtimeMs ?? 0 }]
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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <MemoryCollectionControls
        builtinColumns={BUILTIN_COLUMNS}
        builtinLabels={BUILTIN_LABELS}
        allPropertyKeys={allPropertyKeys}
        visibleColumns={visibleColumns}
        filterCategories={filterCategories}
        valuesByCategory={valuesByCategory}
        filters={config.filters}
        filterCategory={filterCategory}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        searchMatchCount={searchQuery ? (searchMatchPaths ? searchMatchPaths.size : null) : null}
        searchInputRef={searchInputRef}
        toTitleCase={toTitleCase}
        toggleColumn={toggleColumn}
        setFilterCategory={setFilterCategory}
        toggleFilter={toggleFilter}
        clearFilters={clearFilters}
        toggleSearch={toggleSearch}
        onSearchQueryChange={setSearchQuery}
        onSave={handleSave}
        onCreateNote={() => onCreateNote(collectionPath)}
        hasFilter={hasFilter}
        summaryTotal={enrichedNotes.length}
        filteredTotal={sortedNotes.length}
      />

      <MemoryCollectionTable
        pageNotes={pageNotes}
        visibleColumns={visibleColumns}
        filters={config.filters}
        sort={config.sort}
        sortedNotesCount={sortedNotes.length}
        clampedPage={clampedPage}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        getColumnWidth={getColumnWidth}
        getColumnLabel={toTitleCase}
        onResizeStart={onResizeStart}
        onSort={handleSort}
        onSelectNote={onSelectNote}
        toggleFilter={toggleFilter}
        onPreviousPage={() => setPage((prev) => Math.max(0, prev - 1))}
        onNextPage={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
      />

      <MemoryCollectionSaveDialog
        open={saveDialogOpen}
        saveName={saveName}
        inputRef={saveInputRef}
        onOpenChange={setSaveDialogOpen}
        onSaveNameChange={setSaveName}
        onConfirm={handleSaveConfirm}
      />
    </div>
  )
}
