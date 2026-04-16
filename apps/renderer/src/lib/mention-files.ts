import { stripMemoryPrefix } from '@/lib/wiki-links'

type BuildMentionFileListOptions = {
  files: string[]
  activePath?: string | null
  recentFiles?: string[]
}

export const buildMentionFileList = ({
  files,
  activePath,
  recentFiles,
}: BuildMentionFileListOptions) => {
  const ordered: string[] = []
  const seen = new Set<string>()
  const normalizedFiles = files.map(stripMemoryPrefix)
  const fileSet = new Set(normalizedFiles)

  const addFile = (path?: string | null) => {
    if (!path) return
    const normalized = stripMemoryPrefix(path)
    if (!fileSet.has(normalized) || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    ordered.push(normalized)
  }

  addFile(activePath)
  for (const recent of recentFiles ?? []) {
    addFile(recent)
  }
  for (const file of normalizedFiles) {
    addFile(file)
  }

  return ordered
}
