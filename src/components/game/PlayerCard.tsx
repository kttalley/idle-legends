import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { clearSelectedHero, getSelectedHero, subscribeSelection } from '../../engine/selection'
import { getParty, isInParty, isInvitePending, invitePartyMember, leaveParty, subscribeParty } from '../../engine/party'
import { setWhisperTarget } from '../../engine/whisper'
import { useGameStore } from '../../store/gameStore'
import { useDismissable } from '../ui/useDismissable'
import { ZONES } from '../../data/zones'
import {
  factionLabel, factionNameColor, factionNameColorDim, HOSTILE_MARK, isHostile, resolveFaction,
} from '../../data/factions'

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
  //
  // No focus trap: this is a popover over a live world, not a modal. Trapping Tab here
  // would strand the keyboard on a card that appears from a tap and vanishes on the next
  // one. Outside-press still does not stop the event, so a tap on open ground issues its
  // move order as well — see the note in ui/useDismissable.
  useDismissable(sel != null, clearSelectedHero, { ref, closeOnOutside: true })

  const attackPlayer = useGameStore(s => s.attackPlayer)
  const duelPlayer = useGameStore(s => s.duelPlayer)
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
    // A real fight in the world now, not a resolved sim posted to chat. `runDuel` used to
    // decide the whole thing in one call and print three lines — you never saw it, which
    // made the one PvE-adjacent thing you could do to another player the only fight in the
    // game that happened off screen. Nothing is at stake either way: the loser yields.
    // The card dismisses itself from inside `duelPlayer` — see the note there. Doing it
    // here as well would work, but only for this button, and the card also has to go when
    // a fight starts some other way.
    duelPlayer(sel.speaker)
  }, [sel, duelPlayer])

  // Hostile: the opposite of a duel in every respect. Real combat in the live world,
  // real HP at stake on both sides, and it pays honor rather than nothing. The card
  // closes either way — this is a commitment, not a menu you keep browsing from.
  const onAttack = useCallback(() => {
    if (!sel) return
    attackPlayer(sel.speaker)   // dismisses the card itself; see the note in the store
  }, [sel, attackPlayer])

  if (!sel) return null

  const { speaker } = sel
  const key = `${speaker.name}:${speaker.playerClass}:${speaker.race}:${speaker.level}`
  const inParty = isInParty(key)
  const pending = isInvitePending(key)
  // Hostility and colour both come from `data/factions` now.
  //
  // The old line here compared the speaker's faction STRING against the player's own and
  // called anything that differed hostile — which made every NEUTRAL hero (the gnomes and
  // hornborn who answer to no banner) read as an enemy, and painted them in the enemy's
  // colour. With an Attack button on this card that stopped being a cosmetic error.
  const foeFaction = resolveFaction(speaker.faction)
  const hostile = isHostile(speaker.faction, playerFactionKey)
  const nameColor = factionNameColor(foeFaction)
  const dimColor = factionNameColorDim(foeFaction)

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
            color: nameColor, fontWeight: 700,
            fontSize: '0.95rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{hostile && <span title="enemy faction">{HOSTILE_MARK} </span>}{speaker.name}</div>
          <div style={{ color: '#a89e8c', fontSize: '0.76rem' }}>
            Lv {speaker.level} {speaker.race} {speaker.playerClass}
          </div>
          {speaker.spec && (
            <div style={{ color: '#d8b878', fontSize: '0.76rem' }}>{speaker.spec}</div>
          )}
          {/* Most of the crowd is generated. This one is somebody's actual character,
              pulled off the ladder with their real gear on — which is what makes honor
              taken here worth more than honor taken off a stand-in, so it says so. */}
          {speaker.ghostUserId && (
            <div style={{ color: '#7fbf9f', fontSize: '0.7rem', marginTop: 2 }}>
              ● real player
            </div>
          )}
          <div style={{ color: dimColor, fontSize: '0.7rem', marginTop: 3 }}>
            {factionLabel(foeFaction)}
          </div>
        </div>
        <button
          onClick={clearSelectedHero}
          title="Close"
          aria-label="Close"
          className="player-card-close"
          style={{ background: 'none', border: 'none', color: 'var(--muted-warm)', cursor: 'pointer' }}
        >✕</button>
      </div>

      {inParty && (
        <div style={{ color: '#7fbf7f', fontSize: '0.74rem', marginTop: 5 }}>● in your party</div>
      )}

      {/* Two different cards, decided by one fact.
          A friendly gets the social kit: whisper, invite, friendly duel. A hostile gets
          the whisper (you can always talk to the other side — it is just trash talk) and
          an attack. No invite at all rather than a disabled one, because a greyed-out
          button invites the player to wonder what would unlock it, and nothing does. */}
      <div style={{ display: 'grid', gap: 5, marginTop: 9 }}>
        <CardButton onClick={onWhisper} label={hostile ? 'Trash talk' : 'Whisper'} />
        {hostile ? (
          <>
            <CardButton
              onClick={onAttack}
              label={`${HOSTILE_MARK} Attack`}
              hint="hostile — real combat, and honor for the kill"
              danger
            />
            <div style={{ color: 'var(--muted-warm)', fontSize: '0.68rem', lineHeight: 1.3 }}>
              Enemy faction — you cannot group with them.
            </div>
          </>
        ) : inParty ? (
          <CardButton onClick={() => { leaveParty(key); clearSelectedHero() }} label="Leave party" />
        ) : (
          <>
            <CardButton onClick={onInvite} label={pending ? 'Invite sent…' : 'Invite to party'} disabled={pending} />
            <CardButton onClick={onDuel} label="Duel" hint="a real fight — the loser yields, nothing is at stake" />
          </>
        )}
      </div>
    </div>
  )
}

function CardButton({ onClick, label, disabled, hint, danger }: {
  onClick: () => void; label: string; disabled?: boolean; hint?: string; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="player-card-btn"
      style={{
        width: '100%', textAlign: 'left',
        background: disabled ? 'rgba(60,48,32,0.5)' : danger ? '#5e2018' : '#5a4020',
        border: '1px solid var(--edge-soft)', borderRadius: 6,
        color: disabled ? 'var(--muted-warm)' : danger ? '#ffbdb0' : 'var(--gold-warm)',
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
