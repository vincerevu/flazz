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
  const recordedAtIsoRef = React.useRef<string | null>(null)
  const relativePathRef = React.useRef<string | null>(null)
  const audioPathRef = React.useRef<string | null>(null)
  const transcriptRef = React.useRef<string>('')

  const buildNoteContent = React.useCallback(
    (recordedAt: Date, relativePath: string, transcript: string, audioPath?: string | null) => {
      const lines = [
        '---',
        'type: voice memo',
        `recorded_at: "${recordedAt.toISOString()}"`,
        `path: "${relativePath}"`,
      ]

      if (audioPath) {
        lines.push(`audio: "${audioPath}"`)
      }

      lines.push(
        '---',
        '',
        '# Voice Memo',
        '',
        '## Transcript',
        '',
        transcript || '*No speech detected.*',
        '',
      )

      return lines.join('\n')
    },
    [],
  )

  const startRecording = async () => {
    try {
      const now = new Date()
      const timestamp = now.toISOString().replace(/[:.]/g, '-')
      const dateStr = now.toISOString().split('T')[0]
      const noteName = `voice-memo-${timestamp}`
      const notePath = `memory/Voice Memos/${dateStr}/${noteName}.md`
      const relativePath = `Voice Memos/${dateStr}/${noteName}.md`

      timestampRef.current = timestamp
      recordedAtIsoRef.current = now.toISOString()
      notePathRef.current = notePath
      relativePathRef.current = relativePath
      audioPathRef.current = null

      await workspaceIpc.mkdir(`memory/Voice Memos/${dateStr}`, { recursive: true })
      const initialContent = buildNoteContent(now, relativePath, '*Recording in progress...*')
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
          const currentTimestamp = timestampRef.current
          const currentDate = currentTimestamp?.split('T')[0] ?? new Date().toISOString().split('T')[0]
          const audioPath = `memory/Voice Memos/${currentDate}/${audioFilename}`
          const arrayBuffer = await blob.arrayBuffer()
          const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))
          await workspaceIpc.writeFile(audioPath, base64, { encoding: 'base64' })
          audioPathRef.current = audioPath
        } catch (err) {
          console.error('Failed to save audio file', err)
        }

        const currentNotePath = notePathRef.current
        const currentRelativePath = relativePathRef.current
        if (currentNotePath && currentRelativePath) {
          const finalTranscript = transcriptRef.current.trim()
          const recordedAt = recordedAtIsoRef.current ? new Date(recordedAtIsoRef.current) : new Date()
          const finalContent = buildNoteContent(
            recordedAt,
            currentRelativePath,
            finalTranscript,
            audioPathRef.current,
          )
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
