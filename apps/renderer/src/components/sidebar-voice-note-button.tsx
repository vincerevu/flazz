"use client"

import * as React from 'react'
import { Mic, Square } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'
import { workspaceIpc } from '@/services/workspace-ipc'

export function SidebarVoiceNoteButton({
  onNoteCreated,
}: {
  onNoteCreated?: (path: string) => void
}) {
  const [isRecording, setIsRecording] = React.useState(false)
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const recognitionRef = React.useRef<any>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const notePathRef = React.useRef<string | null>(null)
  const timestampRef = React.useRef<string | null>(null)
  const relativePathRef = React.useRef<string | null>(null)
  const transcriptRef = React.useRef<string>('')

  const startRecording = async () => {
    try {
      const now = new Date()
      const timestamp = now.toISOString().replace(/[:.]/g, '-')
      const dateStr = now.toISOString().split('T')[0]
      const noteName = `voice-memo-${timestamp}`
      const notePath = `memory/Voice Memos/${dateStr}/${noteName}.md`

      timestampRef.current = timestamp
      notePathRef.current = notePath
      const relativePath = `Voice Memos/${dateStr}/${noteName}`
      relativePathRef.current = relativePath

      await workspaceIpc.mkdir(`memory/Voice Memos/${dateStr}`, { recursive: true })

      const initialContent = `# Voice Memo

**Type:** voice memo
**Recorded:** ${now.toLocaleString()}
**Path:** ${relativePath}

## Transcript

*Recording in progress...*
`
      await workspaceIpc.writeFile(notePath, initialContent, { encoding: 'utf8' })
      onNoteCreated?.(notePath)

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.lang = 'vi-VN'
        recognition.continuous = true
        recognition.interimResults = true

        recognition.onresult = (event: any) => {
          let currentTranscript = ''
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            if (event.results[index].isFinal) {
              transcriptRef.current += event.results[index][0].transcript + ' '
            } else {
              currentTranscript += event.results[index][0].transcript
            }
          }
        }

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error)
        }

        recognition.start()
        recognitionRef.current = recognition
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      transcriptRef.current = ''

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const ext = mimeType === 'audio/mp4' ? 'm4a' : 'webm'
        const audioFilename = `voice-memo-${timestampRef.current}.${ext}`

        try {
          await workspaceIpc.mkdir('voice_memos', { recursive: true })
          const arrayBuffer = await blob.arrayBuffer()
          const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))
          await workspaceIpc.writeFile(`voice_memos/${audioFilename}`, base64, { encoding: 'base64' })
        } catch (err) {
          console.error('Failed to save audio file', err)
        }

        const currentNotePath = notePathRef.current
        const currentRelativePath = relativePathRef.current
        if (currentNotePath && currentRelativePath) {
          const finalTranscript = transcriptRef.current.trim()
          const finalContent = `# Voice Memo

**Type:** voice memo
**Recorded:** ${new Date().toLocaleString()}
**Path:** ${currentRelativePath}

## Transcript

${finalTranscript || '*No speech detected.*'}
`
          await workspaceIpc.writeFile(currentNotePath, finalContent, { encoding: 'utf8' })
          onNoteCreated?.(currentNotePath)
          toast(finalTranscript ? 'Voice memo saved' : 'Voice memo saved (no transcript)', 'success')
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      toast('Recording started', 'success')
    } catch (err) {
      console.error(err)
      toast('Could not access microphone', 'error')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    mediaRecorderRef.current = null
    recognitionRef.current = null
    setIsRecording(false)
  }

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
