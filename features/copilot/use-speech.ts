'use client'
// Push-to-talk (FR-CP-05) with the browser's own speech recognition where it exists (Chrome, Edge,
// Safari). Hold to talk, release to stop: the transcript goes into the input to check and edit before
// sending. Deepgram with name keyterms replaces this when a key is issued (02-TRD.md §3.6).
import { useCallback, useRef, useState } from 'react'

interface RecognitionResultEvent {
  readonly results: ArrayLike<ArrayLike<{ readonly transcript: string }>>
}

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

export interface Speech {
  readonly supported: boolean
  readonly listening: boolean
  start(): void
  stop(): void
}

/** `onTranscript` receives the final words when the coordinator releases the button. */
export function useSpeech(onTranscript: (text: string) => void): Speech {
  const recognition = useRef<Recognition | null>(null)
  const [listening, setListening] = useState(false)
  const Constructor = recognitionConstructor()

  const start = useCallback(() => {
    if (!Constructor || recognition.current) return
    const instance = new Constructor()
    instance.lang = 'en-GB'
    instance.interimResults = false
    instance.continuous = true
    instance.onresult = (event) => {
      const text = Array.from(event.results, (result) => result[0]?.transcript ?? '').join(' ').trim()
      if (text) onTranscript(text)
    }
    instance.onerror = () => setListening(false)
    instance.onend = () => {
      recognition.current = null
      setListening(false)
    }
    recognition.current = instance
    setListening(true)
    instance.start()
  }, [Constructor, onTranscript])

  const stop = useCallback(() => recognition.current?.stop(), [])

  return { supported: Constructor !== null, listening, start, stop }
}
