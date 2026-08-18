import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getChatMessages, pushChat, subscribeChat, type ChatMessage } from '../../engine/chatLog'
import { chatGenStatus } from '../../engine/chatGen'
import { useGameStore } from '../../store/gameStore'
// One table for name colour, shared with the nameplates, the target card, the party frame
// and the ladder. This file used to keep its own copy, which is exactly how the chat feed
// and the world ended up disagreeing about who was on which side.
import { factionNameColor, HOSTILE_MARK, isHostile } from '../../data/factions'

// Zone chat — a feed of what the world is saying around you, plus a /say input so the
// player can join the conversation.
//
// Whispers deliberately do NOT live here any more. Private conversations moved to their
// own floating window (`WhisperWindow`) because this panel is only 232×112px on desktop
// and a transform-hidden bottom sheet on mobile; a whisper target selector plus a thread
// never fit. Zone chat, by contrast, just needs a simple broadcast input, which sits
// cleanly at the foot of the feed.
//
// Reads from `engine/chatLog` via `useSyncExternalStore` rather than from `gameStore`, so
// ambient chatter never travels through the player's state.


function timeOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function ChatPanel() {
  const messages = useSyncExternalStore(subscribeChat, getChatMessages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const playerName = useGameStore(s => s.playerName)
  const playerFaction = useGameStore(s => s.playerFaction)

  // Everything except private threads: zone chatter plus system notices (invites, duel
  // results), which are answers to things the player just did and belong in view.
  const shown = useMemo(() => messages.filter(m => m.channel !== 'whisper'), [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [shown.length])

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    pushChat({
      channel: 'zone',
      from: playerName || 'You',
      faction: playerFaction ?? 'neutral',
      text,
      mine: true,
    })
    setDraft('')
    inputRef.current?.focus()
  }, [draft, playerName, playerFaction])

  const status = chatGenStatus()
  const statusLabel =
    status === 'off' ? 'canned' : status === 'warming' ? 'warming' :
    status === 'failing' ? 'offline' : 'live'
  const statusColor =
    status === 'live' ? '#7fbf7f' : status === 'failing' ? '#c07070' : 'var(--muted-warm)'

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <div style={{ minWidth: 0 }}>
          <div className="chat-panel-title">Zone Chat</div>
          <div className="chat-panel-status" title={`Generated chat: ${statusLabel}`}>
            <span style={{ color: statusColor }}>●</span> {statusLabel}
          </div>
        </div>
      </div>
      <div className="chat-panel-body">
        {shown.length === 0 && (
          <div style={{ color: 'var(--muted-warm)', padding: '4px 2px', fontSize: '0.74rem' }}>
            Quiet out here. Heroes nearby will start talking.
          </div>
        )}
        {shown.map(m => <ChatRow key={m.id} m={m} playerFaction={playerFaction} />)}
        <div ref={bottomRef} />
      </div>
      <div className="chat-panel-footer">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          placeholder="say something…"
          maxLength={200}
          className="chat-input"
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className="chat-send"
          style={{ opacity: draft.trim() ? 1 : 0.5 }}
        >Send</button>
      </div>
    </div>
  )
}

function ChatRow({ m, playerFaction }: { m: ChatMessage; playerFaction: string }) {
  const system = m.channel === 'system' && !m.from
  const color = factionNameColor(m.faction ?? 'neutral')
  // Crossed swords in the feed for the same reason they are on the nameplate and the
  // card: chat is where you meet most of the other faction, and "can I kill this person"
  // should not require reading the colour of small text against a busy background.
  const hostile = !m.mine && isHostile(m.faction, playerFaction)
  return (
    <div className={`chat-bubble${system ? ' chat-bubble-system' : ''}`}>
      <div className="chat-meta">
        <span className="chat-meta-time">{timeOf(m.ts)}</span>
        {m.from && (
          <span className="chat-meta-name" style={{ color }}>
            {hostile ? `${HOSTILE_MARK} ` : ''}[{m.from}]
          </span>
        )}
      </div>
      <div>
        {m.pending ? <span style={{ color: 'var(--muted-warm)' }}>…</span> : m.text}
      </div>
    </div>
  )
}
