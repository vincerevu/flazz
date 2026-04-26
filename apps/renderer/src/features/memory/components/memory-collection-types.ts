export type NoteEntry = {
  path: string
  name: string
  folder: string
  fields: Record<string, string | string[]>
  mtimeMs: number
}

export type SortDir = "asc" | "desc"

export type ActiveFilter = { category: string; value: string }
