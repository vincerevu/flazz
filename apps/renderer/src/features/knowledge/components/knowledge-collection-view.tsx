import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Filter, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { workspaceIpc } from '@/services/workspace-ipc'
import { extractAllFrontmatterValues, splitFrontmatter } from '@/lib/frontmatter'
import type { TreeNode } from '@/features/knowledge/types'
import { getKnowledgeCollectionMeta, type KnowledgeCollectionPath } from '@/features/knowledge/utils/collections'

type NoteEntry = {
  path: string
  name: string
  folder: string
  mtimeMs: number
  fields: Record<string, string | string[]>
}

type SortField = 'name' | 'folder' | 'mtimeMs' | string
type SortDirection = 'asc' | 'desc'

const DEFAULT_COLUMNS = ['name', 'folder', 'mtimeMs']

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

function collectMarkdownFiles(node: TreeNode | null, rootPath: string): Omit<NoteEntry, 'fields'>[] {
  if (!node) return []
  const walk = (current: TreeNode): Omit<NoteEntry, 'fields'>[] => {
    if (current.kind === 'file' && current.path.endsWith('.md')) {
      const relativeFolder = current.path.slice(rootPath.length).replace(/^\/+/, '').split('/').slice(0, -1).join('/')
      return [{
        path: current.path,
        name: current.name.replace(/\.md$/i, ''),
        folder: relativeFolder || 'Root',
        mtimeMs: current.stat?.mtimeMs ?? 0,
      }]
    }

    return (current.children ?? []).flatMap(walk)
  }

  return walk(node)
}

function formatDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function titleCase(value: string) {
  if (value === 'mtimeMs') return 'Last Modified'
  return value
    .split(/[_\s-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function getFieldValue(entry: NoteEntry, key: string): string {
  if (key === 'name') return entry.name
  if (key === 'folder') return entry.folder
  if (key === 'mtimeMs') return formatDate(entry.mtimeMs)
  const field = entry.fields[key]
  if (!field) return ''
  return Array.isArray(field) ? field.join(', ') : field
}

function getSortValue(entry: NoteEntry, key: SortField): string | number {
  if (key === 'mtimeMs') return entry.mtimeMs
  return getFieldValue(entry, key).toLowerCase()
}

export function KnowledgeCollectionView({
  collectionPath,
  tree,
  onSelectNote,
  onCreateNote,
}: {
  collectionPath: KnowledgeCollectionPath
  tree: TreeNode[]
  onSelectNote: (path: string) => void
  onCreateNote: (parentPath: string) => void
}) {
  const collection = getKnowledgeCollectionMeta(collectionPath)
  const baseEntries = useMemo(() => {
    const node = findNode(tree, collectionPath)
    return collectMarkdownFiles(node, collectionPath)
  }, [tree, collectionPath])

  const [fieldsByPath, setFieldsByPath] = useState<Map<string, Record<string, string | string[]>>>(new Map())
  const [query, setQuery] = useState('')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('mtimeMs')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const loadGenerationRef = useRef(0)

  useEffect(() => {
    const generation = ++loadGenerationRef.current
    let cancelled = false
    const paths = baseEntries.map((entry) => entry.path)
    setFieldsByPath(new Map())

    async function loadBatch() {
      const batchSize = 24
      for (let index = 0; index < paths.length; index += batchSize) {
        if (cancelled) return
        const batch = paths.slice(index, index + batchSize)
        const results = await Promise.all(batch.map(async (path) => {
          try {
            const result = await workspaceIpc.readFile(path, 'utf8')
            const { raw } = splitFrontmatter(result.data)
            return { path, fields: extractAllFrontmatterValues(raw) }
          } catch {
            return { path, fields: {} as Record<string, string | string[]> }
          }
        }))

        if (cancelled || generation !== loadGenerationRef.current) return

        setFieldsByPath((prev) => {
          const next = new Map(prev)
          for (const result of results) {
            next.set(result.path, result.fields)
          }
          return next
        })
      }
    }

    void loadBatch()
    return () => {
      cancelled = true
    }
  }, [baseEntries])

  const notes = useMemo<NoteEntry[]>(() => (
    baseEntries.map((entry) => ({
      ...entry,
      fields: fieldsByPath.get(entry.path) ?? {},
    }))
  ), [baseEntries, fieldsByPath])

  const allPropertyKeys = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of notes) {
      for (const key of Object.keys(entry.fields)) {
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => key)
  }, [notes])

  const visibleColumns = useMemo(() => [
    ...DEFAULT_COLUMNS,
    ...allPropertyKeys.slice(0, 3),
  ], [allPropertyKeys])

  const folderOptions = useMemo(() => (
    Array.from(new Set(notes.map((entry) => entry.folder))).filter(Boolean).sort((a, b) => a.localeCompare(b))
  ), [notes])

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const next = notes.filter((entry) => {
      if (folderFilter && entry.folder !== folderFilter) return false
      if (!normalizedQuery) return true
      const haystack = [
        entry.name,
        entry.folder,
        ...Object.entries(entry.fields).flatMap(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(' ') : value,
        ]),
      ].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })

    return next.sort((a, b) => {
      const aValue = getSortValue(a, sortField)
      const bValue = getSortValue(b, sortField)
      const direction = sortDirection === 'asc' ? 1 : -1
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction
      }
      return String(aValue).localeCompare(String(bValue)) * direction
    })
  }, [folderFilter, notes, query, sortDirection, sortField])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortField(field)
    setSortDirection(field === 'mtimeMs' ? 'desc' : 'asc')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{collection?.label ?? 'Collection'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {collection?.description ?? 'Structured note collection'}
            </p>
          </div>
          <Button size="sm" onClick={() => onCreateNote(collectionPath)}>
            New note
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder={`Search ${collection?.label?.toLowerCase() ?? 'notes'}`}
            />
          </div>
          {folderOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={folderFilter ? 'default' : 'secondary'} className="gap-1">
                <Filter className="size-3" />
                Folder
              </Badge>
              {folderOptions.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setFolderFilter((prev) => prev === folder ? null : folder)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    folderFilter === folder
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {folder}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filteredNotes.length > 0 ? (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <tr className="border-b border-border">
                {visibleColumns.map((column) => (
                  <th key={column} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort(column)}
                    >
                      <span>{titleCase(column)}</span>
                      {sortField === column ? (
                        sortDirection === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredNotes.map((entry) => (
                <tr
                  key={entry.path}
                  className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40"
                  onClick={() => onSelectNote(entry.path)}
                >
                  {visibleColumns.map((column) => (
                    <td key={column} className="px-4 py-3 align-top text-sm">
                      <div className={column === 'name' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                        {getFieldValue(entry, column) || <span className="text-muted-foreground/50">—</span>}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-6 text-center">
            <div className="text-sm font-medium">
              {baseEntries.length === 0 ? 'No notes in this collection yet.' : 'No notes match your filters.'}
            </div>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {baseEntries.length === 0
                ? `Create your first note in ${collection?.label ?? 'this collection'} to start building a structured workspace.`
                : 'Try clearing the folder filter or search query to see more notes.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
