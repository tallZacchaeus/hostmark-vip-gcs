'use client'
// The assistant drawer, shown as "Ask Victoria" (FR-CP-01…05; Figma "Ask Co-Pilot"): ask by typing or by holding the microphone
// (where the browser supports speech); answers come from live data with links to the records used;
// a requested change comes back as a card to approve or dismiss. One conversation per opening.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { apiSend, errorMessage } from '@/lib/client/api'
import type { CopilotReply } from '@/lib/copilot/engine'
import { ProposalCard } from './ProposalCard'
import { useSpeech } from './use-speech'

const SUGGESTIONS = ['Who arrives in the next 2 hours?', 'Which arrivals have no driver?', 'Is any programme item at risk?', 'Which rooms need cleaning?'] as const

interface Exchange {
  readonly id: number
  readonly question: string
  readonly spoken: boolean
  readonly reply: CopilotReply | null
  readonly error: string | null
}

function CoordinatorMessage({ text, spoken }: { readonly text: string; readonly spoken: boolean }) {
  return (
    <div className="coordinator-message">
      <p>{text}</p>
      {spoken ? (
        <small>
          <Icon name="mic" size={13} />
          Spoken
        </small>
      ) : null}
    </div>
  )
}

function Answer({ reply, onNavigate }: { readonly reply: CopilotReply; readonly onNavigate: () => void }) {
  return (
    <div className="copilot-response">
      <div className="copilot-label">
        <Icon name="sparkle" size={14} />
        Victoria
      </div>
      <p>{reply.answer}</p>
      {reply.citations.length > 0 ? (
        <div className="copilot-rows">
          {reply.citations.map((citation) => (
            <div key={`${citation.href}-${citation.label}`}>
              <Link href={citation.href} onClick={onNavigate}>
                {citation.label}
              </Link>
            </div>
          ))}
        </div>
      ) : null}
      {reply.proposal ? <ProposalCard proposal={reply.proposal} /> : null}
    </div>
  )
}

export function CopilotDrawer({ onClose }: { readonly onClose: () => void }) {
  const [conversationId] = useState(() => crypto.randomUUID())
  const [input, setInput] = useState('')
  const [transcript, setTranscript] = useState<string | null>(null)
  const [exchanges, setExchanges] = useState<readonly Exchange[]>([])
  const [thinking, setThinking] = useState(false)
  const conversation = useRef<HTMLDivElement>(null)
  const heard = useCallback((text: string) => {
    setInput(text)
    setTranscript(text)
  }, [])
  const speech = useSpeech(heard)

  useEffect(() => {
    conversation.current?.scrollTo?.({ top: conversation.current.scrollHeight, behavior: 'smooth' })
  }, [exchanges, thinking])

  const send = async (preset?: string) => {
    const question = (preset ?? input).trim()
    if (!question || thinking) return
    const spoken = preset === undefined && transcript !== null
    const id = Date.now()
    setExchanges((items) => [...items, { id, question, spoken, reply: null, error: null }])
    setInput('')
    setTranscript(null)
    setThinking(true)
    try {
      const reply = await apiSend<CopilotReply>('/api/copilot/chat', 'POST', {
        message: question,
        conversation_id: conversationId,
        input_mode: spoken ? 'voice' : 'text',
        transcript_original: spoken ? transcript : null,
      })
      setExchanges((items) => items.map((item) => (item.id === id ? { ...item, reply } : item)))
    } catch (caught: unknown) {
      setExchanges((items) => items.map((item) => (item.id === id ? { ...item, error: errorMessage(caught) } : item)))
    } finally {
      setThinking(false)
    }
  }

  const hint = speech.listening ? 'Release the button to stop.' : transcript !== null ? 'Check the text, edit it if needed, then press Send.' : speech.supported ? 'Type, or hold the microphone to talk.' : 'Type a question or an instruction.'

  return (
    <Modal onClose={onClose} scrimClassName="copilot-scrim" className="copilot-drawer" as="aside" labelledBy="copilot-title">
      <header>
        <div className="copilot-title">
          <span>
            <Icon name="sparkle" />
          </span>
          <h2 id="copilot-title">Ask Victoria</h2>
          <button type="button" aria-label="Close Victoria" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <p>Answers use live data. Changes need your approval.</p>
      </header>
      <div className="copilot-conversation" ref={conversation} aria-live="polite">
        {exchanges.length === 0 ? (
          <div className="copilot-empty">
            <b>Try asking</b>
            {SUGGESTIONS.map((question) => (
              <button type="button" key={question} onClick={() => void send(question)}>
                {question}
              </button>
            ))}
          </div>
        ) : (
          exchanges.map((exchange) => (
            <div className="copilot-exchange" key={exchange.id}>
              <CoordinatorMessage text={exchange.question} spoken={exchange.spoken} />
              {exchange.reply ? <Answer reply={exchange.reply} onNavigate={onClose} /> : null}
              {exchange.error ? (
                <div className="copilot-live-error" role="alert">
                  <Icon name="alert" />
                  <span>{exchange.error}</span>
                  <Button onClick={() => void send(exchange.question)}>Retry</Button>
                </div>
              ) : null}
            </div>
          ))
        )}
        {thinking ? (
          <div className="copilot-thinking">
            <div className="copilot-label">
              <Icon name="sparkle" size={14} />
              Victoria
            </div>
            <span>
              <i />
              <i />
              <i />
            </span>
            <p>Checking live data…</p>
          </div>
        ) : null}
      </div>
      <footer>
        <div className="copilot-composer">
          {speech.listening ? (
            <div className="copilot-listening">
              <span>
                {Array.from({ length: 8 }, (_, index) => (
                  <i key={index} />
                ))}
              </span>
              <b>Listening…</b>
              <small>Release to stop</small>
            </div>
          ) : (
            <input
              value={input}
              aria-label="Ask or give an instruction"
              maxLength={2000}
              className={transcript !== null ? 'has-transcript' : ''}
              placeholder="Ask or give an instruction"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void send()
              }}
            />
          )}
          <button type="button" className="copilot-send" disabled={!input.trim() || speech.listening || thinking} onClick={() => void send()}>
            <Icon name="plane" size={18} />
            Send
          </button>
          {speech.supported ? (
            <button type="button" className={`copilot-mic ${speech.listening ? 'is-listening' : ''}`} aria-label="Hold to talk" onPointerDown={speech.start} onPointerUp={speech.stop} onPointerCancel={speech.stop}>
              <Icon name="mic" />
            </button>
          ) : null}
        </div>
        <small>{hint}</small>
      </footer>
    </Modal>
  )
}
