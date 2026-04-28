// @refresh reset
"use client"

import * as React from 'react'
import { Mic, Square } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'
import { useVoiceMemoRecorder } from '@/features/memory/hooks/use-voice-memo-recorder'

export function SidebarVoiceNoteButton({
  onNoteCreated,
}: {
  onNoteCreated?: (path: string) => void
}) {
  const { isRecording, startRecording, stopRecording } = useVoiceMemoRecorder({
    onNoteCreated,
    onRecordingStarted: () => {
      toast('Recording started', 'success')
    },
    onSaved: ({ hasTranscript }) => {
      toast(hasTranscript ? 'Voice memo saved' : 'Voice memo saved (no transcript)', 'success')
    },
    onError: (message) => {
      toast(message, 'error')
    },
  })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className="rounded p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {isRecording ? (
            <Square className="size-4 animate-pulse fill-red-500 text-red-500" />
          ) : (
            <Mic className="size-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isRecording ? 'Stop Recording' : 'New Voice Note'}
      </TooltipContent>
    </Tooltip>
  )
}
