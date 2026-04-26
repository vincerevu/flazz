import {
  type ChangeEvent,
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type KeyboardEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'

import { useMentionDetection } from '@/hooks/use-mention-detection'
import { getMentionHighlightSegments } from '@/lib/mention-highlights'
import { toMemoryPath, wikiLabel } from '@/lib/wiki-links'

type PromptControllerLike = {
  textInput: {
    value: string
    setInput: (value: string) => void
  }
} | null

type AttachmentLike = {
  id: string
}

type AttachmentsLike = {
  files: AttachmentLike[]
  add: (files: File[] | FileList) => void
  remove: (id: string) => void
}

type MentionLike = {
  id: string
  displayName: string
}

type MentionsContextLike = {
  mentions: MentionLike[]
  addMention: (path: string, displayName: string) => void
  removeMention: (id: string) => void
} | null

type MemoryFilesLike = {
  files: string[]
  recentFiles: string[]
  visibleFiles: string[]
}

type UsePromptInputTextareaBehaviorOptions = {
  controller: PromptControllerLike
  attachments: AttachmentsLike
  mentionsCtx: MentionsContextLike
  memoryFilesCtx: MemoryFilesLike | null
  onChange?: ChangeEventHandler<HTMLTextAreaElement>
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
  isComposing: boolean
}

export function usePromptInputTextareaBehavior({
  controller,
  attachments,
  mentionsCtx,
  memoryFilesCtx,
  onChange,
  onKeyDown: externalOnKeyDown,
  isComposing,
}: UsePromptInputTextareaBehaviorOptions) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  const currentValue = controller?.textInput.value ?? ''
  const memoryFiles = memoryFilesCtx?.files ?? []
  const recentFiles = memoryFilesCtx?.recentFiles ?? []
  const visibleFiles = memoryFilesCtx?.visibleFiles ?? []

  const mentionLabels = useMemo(() => {
    if (memoryFiles.length === 0) return []
    const labels = memoryFiles
      .map((path) => wikiLabel(path))
      .map((label) => label.trim())
      .filter(Boolean)
    return Array.from(new Set(labels))
  }, [memoryFiles])

  const { activeMention, cursorCoords } = useMentionDetection(
    textareaRef,
    currentValue,
    memoryFiles.length > 0,
  )

  const mentionHighlights = useMemo(
    () => getMentionHighlightSegments(currentValue, activeMention, mentionLabels),
    [currentValue, activeMention, mentionLabels],
  )

  const syncHighlightScroll = useCallback(() => {
    const textarea = textareaRef.current
    const highlight = highlightRef.current
    if (!textarea || !highlight) return
    highlight.scrollTop = textarea.scrollTop
    highlight.scrollLeft = textarea.scrollLeft
  }, [])

  useEffect(() => {
    syncHighlightScroll()
  }, [currentValue, mentionHighlights.hasHighlights, syncHighlightScroll])

  const handleMentionSelect = useCallback((path: string, displayName: string) => {
    if (!controller || !activeMention) return

    const currentText = controller.textInput.value
    const beforeAt = currentText.substring(0, activeMention.triggerIndex)
    const afterQuery = currentText.substring(
      activeMention.triggerIndex + 1 + activeMention.query.length,
    )

    controller.textInput.setInput(`${beforeAt}@${displayName} ${afterQuery}`)

    const fullPath = toMemoryPath(path)
    if (fullPath && mentionsCtx) {
      mentionsCtx.addMention(fullPath, displayName)
    }

    textareaRef.current?.focus()
  }, [activeMention, controller, mentionsCtx])

  const handleMentionClose = useCallback(() => {
    // MentionPopover owns its own close behavior.
  }, [])

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback((event) => {
    if (activeMention && ['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key)) {
      return
    }

    if (event.key === 'Enter') {
      if (activeMention) return
      if (isComposing || event.nativeEvent.isComposing) return
      if (event.shiftKey) return

      event.preventDefault()
      const form = event.currentTarget.form
      const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null
      if (submitButton?.disabled) {
        return
      }
      form?.requestSubmit()
    }

    if (event.key === 'Backspace') {
      const textarea = event.currentTarget
      const cursorPos = textarea.selectionStart
      const selectionEnd = textarea.selectionEnd
      const textValue = controller?.textInput.value ?? textarea.value

      if (cursorPos === selectionEnd) {
        for (const label of mentionLabels) {
          const mentionText = `@${label}`
          const startPos = cursorPos - mentionText.length
          if (startPos < 0) continue

          const textBefore = textValue.substring(startPos, cursorPos)
          if (textBefore !== mentionText) continue
          if (!(startPos === 0 || /\s/.test(textValue[startPos - 1]))) continue

          event.preventDefault()
          const newText = textValue.substring(0, startPos) + textValue.substring(cursorPos)
          if (controller) {
            controller.textInput.setInput(newText)
          } else {
            textarea.value = newText
            textarea.dispatchEvent(new Event('input', { bubbles: true }))
          }

          if (mentionsCtx) {
            const mentionToRemove = mentionsCtx.mentions.find((mention) => mention.displayName === label)
            if (mentionToRemove) {
              mentionsCtx.removeMention(mentionToRemove.id)
            }
          }

          setTimeout(() => {
            textarea.selectionStart = startPos
            textarea.selectionEnd = startPos
          }, 0)
          return
        }
      }
    }

    if (
      event.key === 'Backspace' &&
      event.currentTarget.value === '' &&
      attachments.files.length > 0
    ) {
      event.preventDefault()
      const lastAttachment = attachments.files.at(-1)
      if (lastAttachment) {
        attachments.remove(lastAttachment.id)
      }
    }

    if (event.key === 'Escape' && activeMention) {
      return
    }

    externalOnKeyDown?.(event)
  }, [activeMention, attachments, controller, externalOnKeyDown, isComposing, mentionLabels, mentionsCtx])

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = useCallback((event) => {
    const items = event.clipboardData?.items
    if (!items) return

    const files: File[] = []
    for (const item of items) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }

    if (files.length > 0) {
      event.preventDefault()
      attachments.add(files)
    }
  }, [attachments])

  const controlledProps = controller
    ? {
        value: controller.textInput.value,
        onChange: ((event: ChangeEvent<HTMLTextAreaElement>) => {
          controller.textInput.setInput(event.currentTarget.value)
          onChange?.(event)
        }) satisfies ChangeEventHandler<HTMLTextAreaElement>,
      }
    : { onChange }

  return {
    textareaRef,
    containerRef,
    highlightRef,
    memoryFiles,
    recentFiles,
    visibleFiles,
    activeMention,
    cursorCoords,
    mentionHighlights,
    syncHighlightScroll,
    handleMentionSelect,
    handleMentionClose,
    handleKeyDown,
    handlePaste,
    controlledProps,
  }
}
