import { createContext, useContext, type ReactNode } from 'react'

interface FileCardContextType {
  onOpenMemoryFile: (path: string) => void
}

const FileCardContext = createContext<FileCardContextType | null>(null)

export function useFileCard() {
  const ctx = useContext(FileCardContext)
  if (!ctx) throw new Error('useFileCard must be used within FileCardProvider')
  return ctx
}

export function FileCardProvider({
  onOpenMemoryFile,
  children,
}: {
  onOpenMemoryFile: (path: string) => void
  children: ReactNode
}) {
  return (
    <FileCardContext.Provider value={{ onOpenMemoryFile }}>
      {children}
    </FileCardContext.Provider>
  )
}
