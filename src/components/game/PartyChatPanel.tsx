import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { factionNameColor, resolveFaction } from '../../data/factions'
import { getChatMessages, subscribeChat, type ChatMessage } from '../../engine/chatLog'
import { chatGenStatus } from '../../engine/chatGen'
import { getParty, subscribeParty } from '../../engine/party'
import { sendPartyChat } from '../../engine/partyChat'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'

// Party Chat — the third tab in `.app-log`, sitting next to COMBAT and CHAT.
//
// Deliberately mirrors `ChatPanel` rather than `WhisperWindow`: this is a feed in the
// shared chat slot, not a floating window. The tab only exists when there IS a party,
// so an empty roster shows a small notice rather than a dead input.
//
// The party roster appears in the header as faction-coloured names — the same colour
// their nameplate uses, the same colour the bubble over their head uses (see
// `drawAmbientBarks`). One glance at the world and one glance at the panel land on
// the same answer to "whose voice is that?".


function timeOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function PartyChatPanel() {
  const messages = useSyncExternalStore(subscribeChat, getChatMessages)
  const party = useSyncExternalStore(subscribeParty, getParty)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const playerName = useGameStore(s => s.playerName)
  const playerFaction = useGameStore(s => s.playerFaction)
  const currentZone = useGameStore(s => s.currentZone)
  const zoneName = ZONES[currentZone]?.name ?? String(currentZone)
  const zoneTheme = ZONES[currentZone]?.description ?? 'open wilderness'

  const shown = useMemo(
    () => messages.filter(m => m.channel === 'party'),
    [messages],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [shown.length])

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text || !party.length) return
    sendPartyChat(text, {
      playerName: playerName || 'You',
      playerFaction: playerFaction ?? 'neutral',
      zoneName,
      zoneTheme,
    })
    setDraft('')
    inputRef.current?.focus()
  }, [draft, party.length, playerName, playerFaction, zoneName, zoneTheme])

  const status = chatGenStatus()
  const statusLabel =
    status === 'off' ? 'canned' : status === 'warming' ? 'warming' :
    status === 'failing' ? 'offline' : 'live'
  const statusColor =
    status === 'live' ? '#7fbf7f' : status === 'failing' ? '#c07070' : 'var(--muted-warm)'

  // Roster shown in the header. Same colour as the bubbles + nameplates, so the panel
  // and the world agree about who is speaking.
  const rosterLine = party.map(m => m.speaker.name).join(' · ')

  if (!party.length) {
    return (
      <div className="chat-panel">
        <div className="chat-panel-header">
          <div style={{ minWidth: 0 }}>
            <div className="chat-panel-title">Party Chat</div>
            <div className="chat-panel-status" style={{ color: 'var(--muted-warm)' }}>
              no party
            </div>
          </div>
        </div>
        <div className="chat-panel-body" style={{
          color: 'var(--muted-warm)', fontSize: '0.78rem', padding: '10px 8px',
        }}>
          Invite someone to your party to start a group chat.
        </div>
      </div>
    )
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="chat-panel-title">Party Chat</div>
          <div className="chat-panel-status" title={`Generated chat: ${statusLabel}`}>
            <span style={{ color: statusColor }}>●</span> {statusLabel}
          </div>
          <div
            title={rosterLine}
            style={{
              fontSize: '0.66rem',
              color: 'var(--muted-warm)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 2,
            }}
          >
            {party.map((m, i) => (
              <React.Fragment key={m.key}>
                {i > 0 && <span style={{ color: '#6b6152' }}> · </span>}
                <span style={{ color: factionNameColor(resolveFaction(m.speaker.faction)), fontWeight: 600 }}>
                  {m.speaker.name}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="chat-panel-body">
        {shown.length === 0 && (
          <div style={{ color: 'var(--muted-warm)', padding: '4px 2px', fontSize: '0.74rem' }}>
            Your party is quiet. Say something, or wait for banter.
          </div>
        )}
        {shown.map(m => <PartyRow key={m.id} m={m} />)}
        <div ref={bottomRef} />
      </div>
      <div className="chat-panel-footer">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          placeholder="say something to your party…"
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

function PartyRow({ m }: { m: ChatMessage }) {
  const mine = !!m.mine
  const color = factionNameColor(m.faction ?? 'neutral')
  return (
    <div className={`chat-bubble${mine ? ' chat-bubble-mine' : ''}`}>
      <div className="chat-meta">
        <span className="chat-meta-time">{timeOf(m.ts)}</span>
        {m.from && (
          <span className="chat-meta-name" style={{ color }}>
            [{m.from}]
          </span>
        )}
      </div>
      <div>
        {m.pending ? <span style={{ color: 'var(--muted-warm)' }}>…</span> : m.text}
      </div>
    </div>
  )
}
