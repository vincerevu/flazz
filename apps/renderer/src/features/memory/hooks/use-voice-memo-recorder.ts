// @refresh reset
import { useCallback, useEffect, useRef, useState } from 'react'

import { workspaceIpc } from '@/services/workspace-ipc'

type VoiceMemoRecorderOptions = {
  persistNote?: boolean
  onNoteCreated?: (path: string) => void
  onRecordingStarted?: () => void
  onSaved?: (payload: { transcript: string; notePath: string; hasTranscript: boolean }) => void
  onError?: (message: string, error?: unknown) => void
}

export function useVoiceMemoRecorder({
  persistNote = true,
  onNoteCreated,
  onRecordingStarted,
  onSaved,
  onError,
}: VoiceMemoRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false)
  const [waveformLevels, setWaveformLevels] = useState<number[]>(() => Array.from({ length: 28 }, () => 0.12))
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const waveformRafRef = useRef<number | null>(null)
  const discardOnStopRef = useRef(false)
  const chunksRef = useRef<Blob[]>([])
  const notePathRef = useRef<string | null>(null)
  const timestampRef = useRef<string | null>(null)
  const recordedAtIsoRef = useRef<string | null>(null)
  const relativePathRef = useRef<string | null>(null)
  const audioPathRef = useRef<string | null>(null)
  const transcriptRef = useRef<string>('')
  const interimTranscriptRef = useRef<string>('')
  const recognitionSettledRef = useRef<Promise<void> | null>(null)
  const resolveRecognitionSettledRef = useRef<(() => void) | null>(null)

  const buildNoteContent = useCallback(
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

  const stopWaveform = useCallback(() => {
    if (waveformRafRef.current) {
      cancelAnimationFrame(waveformRafRef.current)
      waveformRafRef.current = null
    }
    analyserRef.current = null
    dataArrayRef.current = null
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    setWaveformLevels(Array.from({ length: 28 }, () => 0.12))
  }, [])

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const waitForRecognitionToFlush = async () => {
    const pending = recognitionSettledRef.current
    if (!pending) return
    await Promise.race([
      pending,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 700)
      }),
    ])
  }

  const stopRecording = useCallback(() => {
    discardOnStopRef.current = false
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      cleanupStream()
      stopWaveform()
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    mediaRecorderRef.current = null
    setIsRecording(false)
  }, [cleanupStream, stopWaveform])

  const cancelRecording = useCallback(async () => {
    discardOnStopRef.current = true
    stopRecording()
  }, [stopRecording])

  const startRecording = useCallback(async () => {
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

      if (persistNote) {
        await workspaceIpc.mkdir(`memory/Voice Memos/${dateStr}`, { recursive: true })
        const initialContent = buildNoteContent(now, relativePath, '*Recording in progress...*')
        await workspaceIpc.writeFile(notePath, initialContent, { encoding: 'utf8' })
        onNoteCreated?.(notePath)
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.lang = navigator.language || 'vi-VN'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        interimTranscriptRef.current = ''
        recognitionSettledRef.current = new Promise<void>((resolve) => {
          resolveRecognitionSettledRef.current = resolve
        })

        recognition.onresult = (event: any) => {
          let finalChunk = ''
          let interimChunk = ''
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            if (event.results[index].isFinal) {
              finalChunk += `${event.results[index][0].transcript} `
            } else {
              interimChunk += `${event.results[index][0].transcript} `
            }
          }
          if (finalChunk) {
            transcriptRef.current = `${transcriptRef.current} ${finalChunk}`.trim()
          }
          interimTranscriptRef.current = interimChunk.trim()
        }

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error)
          resolveRecognitionSettledRef.current?.()
          resolveRecognitionSettledRef.current = null
          recognitionSettledRef.current = null
        }

        recognition.onend = () => {
          resolveRecognitionSettledRef.current?.()
          resolveRecognitionSettledRef.current = null
          recognitionSettledRef.current = null
        }

        recognition.start()
        recognitionRef.current = recognition
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.82
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        audioContextRef.current = audioContext
        analyserRef.current = analyser
        dataArrayRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))

        const updateWaveform = () => {
          const activeAnalyser = analyserRef.current
          const activeData = dataArrayRef.current
          if (!activeAnalyser || !activeData) return
          activeAnalyser.getByteFrequencyData(activeData)
          const bucketSize = Math.max(1, Math.floor(activeData.length / 28))
          const nextLevels = Array.from({ length: 28 }, (_, index) => {
            let total = 0
            let count = 0
            const start = index * bucketSize
            const end = Math.min(activeData.length, start + bucketSize)
            for (let i = start; i < end; i += 1) {
              total += activeData[i]
              count += 1
            }
            const normalized = count > 0 ? total / (count * 255) : 0
            return Math.max(0.12, Math.min(1, normalized * 1.8))
          })
          setWaveformLevels(nextLevels)
          waveformRafRef.current = requestAnimationFrame(updateWaveform)
        }

        waveformRafRef.current = requestAnimationFrame(updateWaveform)
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      transcriptRef.current = ''
      interimTranscriptRef.current = ''

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        cleanupStream()
        stopWaveform()
        await waitForRecognitionToFlush()
        recognitionRef.current = null

        if (discardOnStopRef.current) {
          const currentNotePath = notePathRef.current
          if (currentNotePath) {
            try {
              await workspaceIpc.remove(currentNotePath)
            } catch (err) {
              console.error('Failed to remove discarded voice memo note', err)
            }
          }
          if (audioPathRef.current) {
            try {
              await workspaceIpc.remove(audioPathRef.current)
            } catch (err) {
              console.error('Failed to remove discarded voice memo audio', err)
            }
          }
          discardOnStopRef.current = false
          return
        }

        if (persistNote) {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          const ext = mimeType === 'audio/mp4' ? 'm4a' : 'webm'
          const audioFilename = `voice-memo-${timestampRef.current}.${ext}`

          try {
            const currentTimestamp = timestampRef.current
            const currentDate = currentTimestamp?.split('T')[0] ?? new Date().toISOString().split('T')[0]
            const audioPath = `memory/Voice Memos/${currentDate}/${audioFilename}`
            const arrayBuffer = await blob.arrayBuffer()
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
            )
            await workspaceIpc.writeFile(audioPath, base64, { encoding: 'base64' })
            audioPathRef.current = audioPath
          } catch (err) {
            console.error('Failed to save audio file', err)
          }
        }

        const currentNotePath = notePathRef.current
        const currentRelativePath = relativePathRef.current
        const finalTranscript = [transcriptRef.current.trim(), interimTranscriptRef.current.trim()]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (persistNote && currentNotePath && currentRelativePath) {
          const recordedAt = recordedAtIsoRef.current ? new Date(recordedAtIsoRef.current) : new Date()
          const finalContent = buildNoteContent(
            recordedAt,
            currentRelativePath,
            finalTranscript,
            audioPathRef.current,
          )
          await workspaceIpc.writeFile(currentNotePath, finalContent, { encoding: 'utf8' })
          onNoteCreated?.(currentNotePath)
          onSaved?.({
            transcript: finalTranscript,
            notePath: currentNotePath,
            hasTranscript: Boolean(finalTranscript),
          })
        } else {
          onSaved?.({
            transcript: finalTranscript,
            notePath: '',
            hasTranscript: Boolean(finalTranscript),
          })
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      onRecordingStarted?.()
    } catch (err) {
      console.error(err)
      onError?.('Could not access microphone', err)
    }
  }, [buildNoteContent, cleanupStream, onError, onNoteCreated, onRecordingStarted, onSaved, persistNote, stopWaveform])

  useEffect(() => () => {
    discardOnStopRef.current = true
    stopRecording()
  }, [stopRecording])

  return {
    waveformLevels,
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}
