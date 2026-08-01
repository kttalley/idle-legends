import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { clearSelectedHero, getSelectedHero, subscribeSelection } from '../../engine/selection'
import { getParty, isInParty, isInvitePending, invitePartyMember, leaveParty, subscribeParty } from '../../engine/party'
import { setWhisperTarget } from '../../engine/whisper'
import { runDuel } from '../../engine/duel'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'

// The target card — what you get for tapping another player in the world.
//
// Replaces the original behaviour of jumping straight into a whisper thread. On desktop
// that was merely abrupt; on a phone it was invisible, because the chat panel it switched
// is off-screen behind the dock. A card appears where the thumb already is, says who you
// just tapped, and offers the three things you can do about them.
//
// Positioned next to the hero but clamped into the viewport, so a tap near an edge does
// not push the card off-screen.

// Touch-first sizing. The clamp below needs a height that matches what actually renders,
// and on coarse pointers every button grows to 44pt — so the card is materially taller
// there. Guessing low would let the card hang off the bottom of a phone screen.
const CARD_W = 216
const CARD_H_FINE = 190
const CARD_H_COARSE = 260

export function PlayerCard() {
  const sel = useSyncExternalStore(subscribeSelection, getSelectedHero)
  useSyncExternalStore(subscribeParty, getParty)   // re-render on party changes
  const ref = useRef<HTMLDivElement>(null)

  // Dismiss on outside tap or Escape — a card you cannot get rid of is worse than no card.
  useEffect(() => {
    if (!sel) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) clearSelectedHero()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearSelectedHero() }
    // Capture phase so this runs before the canvas handler. Note it does NOT stop the
    // event: a tap on open ground still issues a move order, which is how targeting works
    // in an MMO — you click away and your character goes there. If that turns out to feel
    // wrong on touch, `stopPropagation()` here makes the dismiss purely a dismiss.
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [sel])

  const playerName = useGameStore(s => s.playerName)
  const currentZone = useGameStore(s => s.currentZone)
  const factionNames = useGameStore(s => s.factionNames)
  const playerFactionKey = useGameStore(s => s.playerFaction)
  const zoneName = ZONES[currentZone]?.name ?? String(currentZone)
  const playerFaction = factionNames?.[playerFactionKey] ?? 'your faction'

  const onWhisper = useCallback(() => {
    if (!sel) return
    setWhisperTarget(sel.speaker)
    clearSelectedHero()
  }, [sel])

  const onInvite = useCallback(() => {
    if (!sel) return
    invitePartyMember(sel.speaker, playerName || 'You', playerFaction, zoneName)
    clearSelectedHero()
  }, [sel, playerName, playerFaction, zoneName])

  const onDuel = useCallback(() => {
    if (!sel) return
    // Friendly: resolved from the shared seeded sim, and it writes nothing back to the
    // player's state — no HP, XP, loot or gold moves.
    runDuel(useGameStore.getState(), sel.speaker)
    clearSelectedHero()
  }, [sel])

  if (!sel) return null

  const { speaker } = sel
  const key = `${speaker.name}:${speaker.playerClass}:${speaker.race}:${speaker.level}`
  const inParty = isInParty(key)
  const pending = isInvitePending(key)
  // Faction names are generated per run, so compare the strings the game actually uses
  // rather than pattern-matching a prefix of them.
  const hostile = speaker.faction.trim().toLowerCase() !== (playerFaction || '').trim().toLowerCase()

  // Clamp into the viewport so an edge tap still shows a whole card.
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const cardH = coarse ? CARD_H_COARSE : CARD_H_FINE
  const left = Math.max(8, Math.min(window.innerWidth - CARD_W - 8, sel.clientX - CARD_W / 2))
  const top = Math.max(8, Math.min(window.innerHeight - cardH - 8, sel.clientY - cardH - 18))

  return (
    <div
      ref={ref}
      className="player-card"
      style={{ position: 'fixed', left, top, width: CARD_W, zIndex: 400 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: hostile ? '#ff8a7a' : '#8ac0ff', fontWeight: 700,
            fontSize: '0.95rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{speaker.name}</div>
          <div style={{ color: '#a89e8c', fontSize: '0.76rem' }}>
            Lv {speaker.level} {speaker.race} {speaker.playerClass}
          </div>
          {speaker.spec && (
            <div style={{ color: '#d8b878', fontSize: '0.76rem' }}>{speaker.spec}</div>
          )}
          <div style={{ color: hostile ? '#c07070' : '#7f9fbf', fontSize: '0.7rem', marginTop: 3 }}>
            {speaker.faction}
          </div>
        </div>
        <button
          onClick={clearSelectedHero}
          title="Close"
          aria-label="Close"
          className="player-card-close"
          style={{ background: 'none', border: 'none', color: '#8a8070', cursor: 'pointer' }}
        >✕</button>
      </div>

      {inParty && (
        <div style={{ color: '#7fbf7f', fontSize: '0.74rem', marginTop: 5 }}>● in your party</div>
      )}

      <div style={{ display: 'grid', gap: 5, marginTop: 9 }}>
        <CardButton onClick={onWhisper} label="Whisper" />
        {inParty
          ? <CardButton onClick={() => { leaveParty(key); clearSelectedHero() }} label="Leave party" />
          : <CardButton onClick={onInvite} label={pending ? 'Invite sent…' : 'Invite to party'} disabled={pending} />}
        <CardButton onClick={onDuel} label="Duel" hint="friendly — nothing is at stake" />
      </div>
    </div>
  )
}

function CardButton({ onClick, label, disabled, hint }: {
  onClick: () => void; label: string; disabled?: boolean; hint?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="player-card-btn"
      style={{
        width: '100%', textAlign: 'left',
        background: disabled ? 'rgba(60,48,32,0.5)' : '#5a4020',
        border: '1px solid #6a5030', borderRadius: 6,
        color: disabled ? '#8a8070' : '#f4c84a',
        // Height is owned by `.player-card-btn` in index.css so the coarse-pointer rule
        // can lift it to 44pt. An inline `minHeight` here would win the cascade and
        // silently cap every button at the mouse size on touch devices — which is exactly
        // what it did until this was measured.
        padding: '8px 10px',
        fontSize: '0.8rem', cursor: disabled ? 'default' : 'pointer',
      }}
    >{label}</button>
  )
}
