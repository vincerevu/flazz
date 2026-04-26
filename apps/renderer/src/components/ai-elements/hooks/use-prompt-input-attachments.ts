import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileUIPart } from 'ai'
import { nanoid } from 'nanoid'

export type PromptInputAttachmentItem = FileUIPart & { id: string }

type PromptInputAttachmentError = {
  code: 'max_files' | 'max_file_size' | 'accept'
  message: string
}

type UsePromptInputAttachmentsOptions = {
  accept?: string
  maxFiles?: number
  maxFileSize?: number
  onError?: (err: PromptInputAttachmentError) => void
}

type UsePromptInputAttachmentsResult = {
  files: PromptInputAttachmentItem[]
  inputRef: RefObject<HTMLInputElement | null>
  addFiles: (files: File[] | FileList) => void
  removeFile: (id: string) => void
  clearFiles: () => void
  openFileDialog: () => void
}

function revokeAttachmentUrl(file: FileUIPart | PromptInputAttachmentItem) {
  if (file.url) {
    URL.revokeObjectURL(file.url)
  }
}

export function usePromptInputAttachments({
  accept,
  maxFiles,
  maxFileSize,
  onError,
}: UsePromptInputAttachmentsOptions): UsePromptInputAttachmentsResult {
  const [files, setFiles] = useState<PromptInputAttachmentItem[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)
  const filesRef = useRef(files)
  filesRef.current = files

  const matchesAccept = useCallback((file: File) => {
    if (!accept || accept.trim() === '') {
      return true
    }

    const patterns = accept
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean)

    return patterns.some((pattern) => {
      if (pattern.endsWith('/*')) {
        return file.type.startsWith(pattern.slice(0, -1))
      }
      return file.type === pattern
    })
  }, [accept])

  const addFiles = useCallback((fileList: File[] | FileList) => {
    const incoming = Array.from(fileList)
    const accepted = incoming.filter((file) => matchesAccept(file))
    if (incoming.length > 0 && accepted.length === 0) {
      onError?.({
        code: 'accept',
        message: 'No files match the accepted types.',
      })
      return
    }

    const sized = accepted.filter((file) => maxFileSize ? file.size <= maxFileSize : true)
    if (accepted.length > 0 && sized.length === 0) {
      onError?.({
        code: 'max_file_size',
        message: 'All files exceed the maximum size.',
      })
      return
    }

    setFiles((prev) => {
      const capacity = typeof maxFiles === 'number'
        ? Math.max(0, maxFiles - prev.length)
        : undefined
      const capped = typeof capacity === 'number' ? sized.slice(0, capacity) : sized
      if (typeof capacity === 'number' && sized.length > capacity) {
        onError?.({
          code: 'max_files',
          message: 'Too many files. Some were not added.',
        })
      }

      return prev.concat(
        capped.map((file) => ({
          id: nanoid(),
          type: 'file' as const,
          url: URL.createObjectURL(file),
          mediaType: file.type,
          filename: file.name,
        })),
      )
    })
  }, [matchesAccept, maxFileSize, maxFiles, onError])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const found = prev.find((file) => file.id === id)
      if (found) {
        revokeAttachmentUrl(found)
      }
      return prev.filter((file) => file.id !== id)
    })
  }, [])

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      for (const file of prev) {
        revokeAttachmentUrl(file)
      }
      return []
    })
  }, [])

  const openFileDialog = useCallback(() => {
    inputRef.current?.click()
  }, [])

  useEffect(() => {
    return () => {
      for (const file of filesRef.current) {
        revokeAttachmentUrl(file)
      }
    }
  }, [])

  return useMemo(() => ({
    files,
    inputRef,
    addFiles,
    removeFile,
    clearFiles,
    openFileDialog,
  }), [files, addFiles, removeFile, clearFiles, openFileDialog])
}
