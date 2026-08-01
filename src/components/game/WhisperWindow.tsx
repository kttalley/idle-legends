import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getChatMessages, subscribeChat, type ChatMessage } from '../../engine/chatLog'
import {
  entityKey, getWhisperTarget, isWhisperBusy, sendWhisper, setWhisperTarget, subscribeWhisperTarget,
} from '../../engine/whisper'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'

// A whisper conversation, in its own floating window.
//
// ── Why this is not a tab in the log panel ────────────────────────────────────
// It was, and it was broken in two different ways at once:
//
//  - **Desktop/tablet:** `.app-log` is 232×112px. A tabbed panel containing a scrolling
//    message list AND a text input does not fit in 112 pixels of height. It rendered, it
//    just had nowhere to put anything.
//  - **Mobile:** `.app-log` is a bottom sheet hidden behind a transform until
//    `activePanel === 'log'`. Tapping "Whisper" set the target and switched a tab inside
//    a panel that was off-screen, so the button appeared to do nothing at all.
//
// Both are symptoms of the same mistake: a conversation with an input field is not a
// log line, and it should not live in the log's real estate. So it gets its own window —
// which is also how whispers behave in an actual MMO. Zone chat stays in the log panel,
// where a read-only feed fits fine.
//
// The window is `position: fixed` and sized by CSS per breakpoint (see `.whisper-window`
// in index.css): a floating panel on desktop, a bottom sheet above the dock on mobile.

export function WhisperWindow() {
  const target = useSyncExternalStore(subscribeWhisperTarget, getWhisperTarget)
  const messages = useSyncExternalStore(subscribeChat, getChatMessages)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const playerName = useGameStore(s => s.playerName)
  const factionNames = useGameStore(s => s.factionNames)
  const playerFactionKey = useGameStore(s => s.playerFaction)
  const playerFaction = factionNames?.[playerFactionKey] ?? ''
  const currentZone = useGameStore(s => s.currentZone)
  const generatedZoneNames = useGameStore(s => s.generatedZoneNames)
  const zoneName = generatedZoneNames?.[currentZone] ?? ZONES[currentZone]?.name ?? String(currentZone)
  const zoneTheme = ZONES[currentZone]?.description ?? 'open wilderness'

  const targetKey = target ? entityKey(target) : null

  const thread = useMemo(
    () => messages.filter(m => m.channel === 'whisper' && m.entityKey === targetKey),
    [messages, targetKey],
  )

  const close = useCallback(() => { setWhisperTarget(null); setDraft('') }, [])

  // Focus the input when a thread opens — the whole point of the gesture is to type.
  // Skipped on coarse pointers: auto-focus there yanks up the on-screen keyboard and
  // covers the conversation you just opened.
  useEffect(() => {
    if (!target) return
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    if (!coarse) requestAnimationFrame(() => inputRef.current?.focus())
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, close])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [thread.length])

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text || !target) return
    sendWhisper(target, playerName || 'You', zoneName, zoneTheme, text)
    setDraft('')
    inputRef.current?.focus()
  }, [draft, target, playerName, zoneName, zoneTheme])

  if (!target) return null

  const busy = isWhisperBusy(entityKey(target))
  const hostile = target.faction.trim().toLowerCase() !== playerFaction.trim().toLowerCase()

  return (
    <div className="whisper-window">
      <div className="whisper-window-header">
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: hostile ? '#ff8a7a' : '#8ac0ff', fontWeight: 700, fontSize: '0.88rem',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{target.name}</div>
          <div style={{ color: '#9a9080', fontSize: '0.7rem' }}>
            Lv {target.level} {target.race} {target.spec ?? target.playerClass}
          </div>
        </div>
        <button onClick={close} title="Close whisper" aria-label="Close whisper" className="whisper-close">✕</button>
      </div>

      <div className="whisper-window-body">
        {thread.length === 0 && (
          <div style={{ color: '#8a8070', fontSize: '0.78rem', padding: '6px 2px' }}>
            Say something to {target.name}.
          </div>
        )}
        {thread.map(m => <WhisperRow key={m.id} m={m} />)}
        <div ref={bottomRef} />
      </div>

      <div className="whisper-window-footer">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          placeholder={`whisper ${target.name}…`}
          maxLength={200}
          // Deliberately NOT stopping keyup propagation. The scene's keydown handler
          // already ignores events from focused inputs, but its keyup handler must still
          // see every release — swallowing one would leave a key logically held down and
          // walk the hero forever.
          className="whisper-input"
        />
        <button
          onClick={send}
          disabled={!draft.trim() || busy}
          className="whisper-send"
          style={{ opacity: !draft.trim() || busy ? 0.5 : 1 }}
        >{busy ? '…' : 'Send'}</button>
      </div>
    </div>
  )
}

function Typing() {
  const [n, setN] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setN(x => (x % 3) + 1), 400)
    return () => clearInterval(t)
  }, [])
  return <span style={{ color: '#777' }}>{'.'.repeat(n)}</span>
}

function WhisperRow({ m }: { m: ChatMessage }) {
  const mine = !!m.mine
  return (
    <div style={{
      display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 4,
    }}>
      <div style={{
        maxWidth: '82%',
        background: mine ? 'rgba(90,64,32,0.85)' : 'rgba(40,34,22,0.9)',
        border: `1px solid ${mine ? '#6a5030' : '#4a3a1e'}`,
        borderRadius: 8,
        padding: '6px 9px',
        color: mine ? '#f7e3b8' : '#ecd8ec',
        fontSize: '0.8rem',
        lineHeight: 1.45,
        wordBreak: 'break-word',
      }}>
        {m.pending ? <Typing /> : m.text}
      </div>
    </div>
  )
}
