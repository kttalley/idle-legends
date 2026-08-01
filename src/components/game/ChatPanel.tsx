import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { getChatMessages, subscribeChat, type ChatMessage } from '../../engine/chatLog'
import { chatGenStatus } from '../../engine/chatGen'

// Zone chat — a read-only feed of what the world is saying around you.
//
// Whispers deliberately do NOT live here any more. This panel occupies `.app-log`, which
// is 232×112px on desktop and a transform-hidden bottom sheet on mobile; a conversation
// with a text input never fit, and on mobile opening one from the world was impossible
// because the slot itself was off-screen — the Whisper button looked broken. Whispers
// moved to their own floating window (`WhisperWindow`). What's left is a feed, which is
// exactly what this space is for.
//
// Reads from `engine/chatLog` via `useSyncExternalStore` rather than from `gameStore`, so
// ambient chatter never travels through the player's state.

const FACTION_COLOR: Record<string, string> = {
  alliance: '#8ac0ff',
  horde: '#ff8a7a',
  neutral: '#9a8f7a',
}

function timeOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function ChatPanel() {
  const messages = useSyncExternalStore(subscribeChat, getChatMessages)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Everything except private threads: zone chatter plus system notices (invites, duel
  // results), which are answers to things the player just did and belong in view.
  const shown = useMemo(() => messages.filter(m => m.channel !== 'whisper'), [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [shown.length])

  const status = chatGenStatus()
  const statusLabel =
    status === 'off' ? 'canned' : status === 'warming' ? 'warming' :
    status === 'failing' ? 'offline' : 'live'
  const statusColor =
    status === 'live' ? '#7fbf7f' : status === 'failing' ? '#c07070' : '#8a8070'

  return (
    <div className="rp-panel flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      <div
        className="rp-panel-header flex items-center justify-between"
        // The header opts out of the branded display face along with the feed below it,
        // so the panel reads as one plain, legible block rather than serif chrome sitting
        // on top of sans content.
        style={{ gap: 6, fontFamily: 'var(--font-chat)', fontSize: '0.72rem', letterSpacing: '0.02em' }}
      >
        <span>Zone Chat</span>
        <span title={`Generated chat: ${statusLabel}`} style={{ fontSize: '0.66rem', color: statusColor }}>
          ● {statusLabel}
        </span>
      </div>
      <div className="combat-log flex-1 p-1" style={{ overflowY: 'auto' }}>
        {shown.length === 0 && (
          <div style={{ color: '#8a8070', padding: '4px 6px', fontSize: '0.74rem' }}>
            Quiet out here. Heroes nearby will start talking.
          </div>
        )}
        {shown.map(m => <ChatRow key={m.id} m={m} />)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function ChatRow({ m }: { m: ChatMessage }) {
  const system = m.channel === 'system' && !m.from
  const color = FACTION_COLOR[m.faction ?? 'neutral'] ?? '#d4b896'
  return (
    <div style={{ padding: '2px 5px', borderBottom: '1px solid rgba(255,255,255,0.04)', lineHeight: 1.45 }}>
      {/* Timestamp is reference information, not content — dimmed and small so the eye
          goes to the name and the message. */}
      <span style={{ color: '#6a6258', marginRight: 5, fontSize: '0.66rem' }}>{timeOf(m.ts)}</span>
      {m.from && <span style={{ color, fontWeight: 700 }}>[{m.from}] </span>}
      <span style={{ color: system ? '#d8b878' : '#e6d5bd' }}>
        {m.pending ? <span style={{ color: '#8a8070' }}>…</span> : m.text}
      </span>
    </div>
  )
}
