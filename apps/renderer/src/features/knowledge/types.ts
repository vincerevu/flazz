import * as workspace from '@flazz/shared/src/workspace.js'
import z from 'zod'

export type DirEntry = z.infer<typeof workspace.DirEntry>

export interface TreeNode extends DirEntry {
  children?: TreeNode[]
  loaded?: boolean
}

export type MarkdownHistoryHandlers = { undo: () => boolean; redo: () => boolean }

export type ViewState =
  | { type: 'chat'; runId: string | null }
  | { type: 'file'; path: string }
  | { type: 'graph' }
  | { type: 'task'; name: string }

export function viewStatesEqual(a: ViewState, b: ViewState): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'chat' && b.type === 'chat') return a.runId === b.runId
  if (a.type === 'file' && b.type === 'file') return a.path === b.path
  if (a.type === 'task' && b.type === 'task') return a.name === b.name
  return true // both graph
}

export const GRAPH_TAB_PATH = '__Flazz_graph_view__'
export const isGraphTabPath = (path: string) => path === GRAPH_TAB_PATH
