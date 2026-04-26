import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null
  onend: ((this: SpeechRecognition, ev: Event) => any) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

type SpeechRecognitionResultList = {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

type SpeechRecognitionResult = {
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

type SpeechRecognitionAlternative = {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition
    }
    webkitSpeechRecognition: {
      new (): SpeechRecognition
    }
  }
}

type UseSpeechRecognitionOptions = {
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onTranscriptionChange?: (text: string) => void
  language?: string
}

export function useSpeechRecognition({
  textareaRef,
  onTranscriptionChange,
  language = 'en-US',
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    ) {
      return
    }

    setIsSupported(true)
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new RecognitionCtor()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onresult = (event) => {
      let finalTranscript = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? ''
        }
      }

      if (finalTranscript && textareaRef?.current) {
        const textarea = textareaRef.current
        const currentValue = textarea.value
        const newValue = currentValue + (currentValue ? ' ' : '') + finalTranscript

        textarea.value = newValue
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
        onTranscriptionChange?.(newValue)
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.stop()
      recognitionRef.current = null
    }
  }, [language, onTranscriptionChange, textareaRef])

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    if (isListening) {
      recognition.stop()
      return
    }
    recognition.start()
  }, [isListening])

  return {
    isListening,
    isSupported,
    toggleListening,
  }
}
