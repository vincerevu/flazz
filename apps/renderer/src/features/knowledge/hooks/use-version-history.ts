import { useState } from 'react'

export function useVersionHistory() {
  const [versionHistoryPath, setVersionHistoryPath] = useState<string | null>(null)
  const [viewingHistoricalVersion, setViewingHistoricalVersion] = useState<{
    oid: string
    content: string
  } | null>(null)

  return {
    versionHistoryPath,
    setVersionHistoryPath,
    viewingHistoricalVersion,
    setViewingHistoricalVersion,
    openVersionHistory: (path: string) => {
      setVersionHistoryPath(path)
      setViewingHistoricalVersion(null)
    },
    closeVersionHistory: () => {
      setVersionHistoryPath(null)
      setViewingHistoricalVersion(null)
    },
  }
}
