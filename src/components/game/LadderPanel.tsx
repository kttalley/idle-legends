// ── The ladder: cross-player leaderboard and duels ────────────────────────────
//
// Lives as a third tab beside COMBAT and CHAT because it is the same kind of surface — a
// scrollable list in the slot that already handles being a drawer on a phone — and because
// adding a tab costs no layout, no new breakpoint, and no dock button.
//
// Every state this can be in is a legitimate one, and none of them is an error dialog:
// cloud switched off in a dev clone, offline on a train, signed in with an empty board on
// launch day. The panel says which, in one line, and offers the action that resolves it.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../../store/gameStore'
import { useDismissable } from '../ui/useDismissable'
import { cloudEnabled } from '../../net/cloudConfig'
import { currentSession, ensureSession } from '../../net/session'
import {
  fetchLeaderboard,
  publishSnapshot,
  type BoardKind,
  type LeaderboardEntry,
} from '../../net/leaderboard'
import { factionNameColor, HOSTILE_MARK, isHostile } from '../../data/factions'
import { getBlocks, subscribeBlocks } from '../../moderation/blocks'
import { ReportDialog } from './ReportDialog'
import { honorRank, nextHonorRank, readPvpRecord } from '../../engine/pvp'
import { FACTION_DEFINITIONS } from '../../data/factions'
// `challenge` (the server-resolved duel) is deliberately no longer imported — duels are
// fought in the world now, through the store. The RECORD tab still reads the history the
// old flow wrote, so past duels remain visible; it simply stops gaining new rows.
import { fetchDuelHistory, type DuelResponse } from '../../net/cloudDuel'
import { buildSnapshot } from '../../net/snapshot'

type Status = 'idle' | 'loading' | 'offline' | 'disabled' | 'ready'

export function LadderPanel({ onClose }: { onClose?: () => void } = {}) {
  const [tab, setTab] = useState<'ladder' | 'record' | 'honor'>('ladder')
  const [status, setStatus] = useState<Status>('idle')
  const [fetched, setEntries] = useState<LeaderboardEntry[]>([])

  // ── Blocked players never appear ────────────────────────────────────────────
  // "Blocking should remove the content from the user's feed instantly" (App Review 1.2).
  // Filtering HERE rather than at the fetch is what makes it instant: the block updates the
  // shared set synchronously, this subscription repaints, and the row is gone on the same
  // tap — no refetch, and it works with the network down.
  const blocks = useSyncExternalStore(subscribeBlocks, getBlocks)
  const entries = useMemo(
    () => fetched.filter(e => !blocks.has(e.userId)),
    [fetched, blocks])

  // Which player the report dialog is open for, if any.
  const [reporting, setReporting] = useState<{ userId: string; name: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [history, setHistory] = useState<DuelResponse[] | null>(null)

  // Which ordering the board is showing. The HONOR tab is not a filtered view of the power
  // ladder — it is a different query with a different index behind it, because the two
  // rankings genuinely disagree: the strongest character on the server may have taken no
  // kills at all, and a dedicated ganker may be nowhere near the top by power.
  const board: BoardKind = tab === 'honor' ? 'honor' : 'power'

  const refresh = useCallback(async (kind: BoardKind = 'power') => {
    if (!cloudEnabled()) { setStatus('disabled'); return }
    setStatus('loading')
    // Publish before reading, so a first-time player sees themselves on the board they just
    // opened rather than an empty list that looks broken.
    const state = useGameStore.getState()
    await publishSnapshot(state)
    const res = await fetchLeaderboard(50, kind)
    if (!res.ok) { setStatus(res.reason === 'disabled' ? 'disabled' : 'offline'); return }
    setEntries(res.data)
    setStatus('ready')
  }, [])

  // Re-fetch when the ORDERING changes, not on every tab press: switching to RECORD reads
  // duel history instead and has no board to reorder.
  useEffect(() => { void refresh(board) }, [refresh, board])

  // Fetched lazily, when the record tab is first opened — most sessions never look at it,
  // and it is a second round trip on a panel that already made one.
  useEffect(() => {
    if (tab !== 'record' || history !== null) return
    let cancelled = false
    void (async () => {
      const res = await fetchDuelHistory(20)
      if (!cancelled) setHistory(res.ok ? res.data : [])
    })()
    return () => { cancelled = true }
  }, [tab, history])

  /**
   * Take the fight into the world, rather than resolving it on a server.
   *
   * This used to POST to the `duel` edge function and render the result as a scoreboard —
   * a fight you could not watch, decided elsewhere, in a game whose every other fight
   * happens in front of you. The store already has the right machinery for both halves
   * (`attackPlayer` for the enemy faction, `duelPlayer` for your own): same body, same
   * renderer, same combat, differing only in whether anything is at stake.
   *
   * So the button now closes the board, spawns them, and starts the fight.
   */
  const onChallenge = useCallback((e: LeaderboardEntry) => {
    const store = useGameStore.getState()
    const speaker = {
      name: e.name,
      playerClass: e.playerClass,
      race: e.race,
      faction: e.faction,
      level: e.level,
      spec: null,
      // Marks them as a real player's character, so the fight uses their PUBLISHED gear
      // rather than a generated stand-in. See `attackPlayer`.
      ghostUserId: e.userId,
    }
    const hostile = isHostile(e.faction, store.playerFaction)
    const started = hostile ? store.attackPlayer(speaker) : store.duelPlayer(speaker)
    if (!started) {
      // Both actions refuse rather than throw, and the reasons are all states the player
      // can see and fix — so say which, instead of leaving a button that does nothing.
      setNote(!store.isAlive ? 'You are in no shape to fight.'
        : store.gameMode !== 'combat' ? 'Finish what you are doing first — you are not in the field.'
        : `Could not reach ${e.name}.`)
      return
    }
    // The board is a menu over people; once one of them is a body three tiles away it is
    // in the way of the fight it just started.
    onClose?.()
  }, [onClose])

  if (status === 'disabled') {
    return (
      <div className="ladder-empty">
        <p>The ladder is offline in this build.</p>
        <p className="ladder-hint">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable it.
        </p>
      </div>
    )
  }

  return (
    <div className="ladder">
      {/* Two sub-views, following WoW's split: the ladder is other people, the record is
          you. Vanilla put honor and rank on the CHARACTER sheet for exactly that reason —
          kept together here only because both are duel-shaped and the panel is small. */}
      <div className="ladder-head">
        <div className="ladder-tabs">
          <button
            className={`ladder-tab${tab === 'ladder' ? ' is-active' : ''}`}
            onClick={() => setTab('ladder')}
          >LADDER</button>
          <button
            className={`ladder-tab${tab === 'honor' ? ' is-active' : ''}`}
            onClick={() => setTab('honor')}
          >{HOSTILE_MARK} HONOR</button>
          <button
            className={`ladder-tab${tab === 'record' ? ' is-active' : ''}`}
            onClick={() => setTab('record')}
          >RECORD</button>
        </div>
        <button
          className="ladder-refresh"
          onClick={() => void refresh(board)}
          disabled={status === 'loading'}
          aria-label="Refresh the ladder"
        >
          {status === 'loading' ? '…' : '↻'}
        </button>
      </div>

      {note && <div className="ladder-note">{note}</div>}

      {status === 'offline' && (
        <div className="ladder-empty">
          <p>Could not reach the ladder.</p>
          <p className="ladder-hint">Your character and progress are unaffected.</p>
        </div>
      )}

      {status === 'ready' && entries.length === 0 && tab !== 'honor' && (
        <div className="ladder-empty">
          <p>No challengers yet.</p>
          <p className="ladder-hint">You are the first to march.</p>
        </div>
      )}

      {tab === 'honor' ? (
        <HonorTab entries={entries} />
      ) : tab === 'ladder' ? (
        <ol className="ladder-list">
          {entries.map(e => (
            <li key={e.userId} className={`ladder-row${e.isYou ? ' is-you' : ''}`}>
              <span className="ladder-rank">{e.rank}</span>
              <span className="ladder-name" style={{ color: factionNameColor(e.faction) }}>
                <span className="ladder-name-text">
                  {e.name}
                  {e.isYou && <span className="ladder-you"> you</span>}
                </span>
                {/* The flag sits INSIDE the name cell, immediately after the name it refers
                    to. `.ladder-row` is a four-column grid, so as a fifth child this button
                    was pushed onto a line of its own — a stray icon under every row. */}
                {!e.isYou && (
                  <button
                    className="ladder-report-btn"
                    aria-label={`Report or block ${e.name}`}
                    title={`Report or block ${e.name}`}
                    onClick={() => setReporting({ userId: e.userId, name: e.name })}
                  >
                    ⚑
                  </button>
                )}
              </span>
              <span className="ladder-meta">
                Lv {e.level}
                {e.zoneCircuit > 0 && <span className="ladder-circuit"> · C{e.zoneCircuit}</span>}
              </span>
              {!e.isYou && (
                <button
                  className="ladder-duel-btn"
                  onClick={() => onChallenge(e)}
                  title={`Fight ${e.name} in the world`}
                >
                  Duel
                </button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <RecordTab history={history} />
      )}

      {reporting && (
        <ReportDialog
          userId={reporting.userId}
          name={reporting.name}
          surface="ladder"
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  )
}

/**
 * PVP HONOR — your own kill record, then the board ranked by kills.
 *
 * Your own line comes FIRST and is read from local state rather than from the board,
 * which is deliberate: honor is earned in the open world against ambient enemy players,
 * so it is a number the client owns and publishes. The board below it is other people,
 * and it can be empty (or offline) without the tab having nothing to say — which is the
 * failure the ladder tab has always had to work around.
 */
function HonorTab({ entries }: { entries: LeaderboardEntry[] }) {
  const record = readPvpRecord(useGameStore(s => s.pvpRecord))
  const myFaction = useGameStore(s => s.playerFaction)
  const rank = honorRank(record.kills)
  const next = nextHonorRank(record.kills)
  const enemy = FACTION_DEFINITIONS[myFaction]?.opposingFaction ?? null

  return (
    <div className="ladder-record">
      <div className="ladder-tally">
        <strong style={{ color: factionNameColor(myFaction) }}>{record.kills}</strong>
        <span className="ladder-hint"> kill{record.kills === 1 ? '' : 's'}</span>
        <span className="ladder-hint"> · {record.deaths} death{record.deaths === 1 ? '' : 's'}</span>
      </div>
      <div className="ladder-hint" style={{ padding: '0 2px 6px' }}>
        <div><strong style={{ color: 'var(--gold-warm)' }}>{rank}</strong>
          {next && <span> · {next.remaining} more for {next.title}</span>}
        </div>
        {record.bestStreak > 0 && (
          <div>
            Streak {record.streak} · best {record.bestStreak}
            {record.lastVictim && <span> · last: {record.lastVictim}</span>}
          </div>
        )}
        {/* Where the kills come from. Worth stating on the board itself: the crowd mixes
            generated heroes with real characters pulled off this very ladder, and a player
            who does not know that reads every kill as fictional. */}
        <div style={{ marginTop: 2 }}>
          Enemy players in the world include real characters from this board.
        </div>
        {record.kills === 0 && (
          <div>
            {enemy
              ? `Find a ${FACTION_DEFINITIONS[enemy].name} player in the world and attack them.`
              : 'Unaligned heroes take no honor — pick a side to fight for.'}
          </div>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="ladder-empty">
          <p>No honor recorded yet.</p>
          <p className="ladder-hint">Nobody on this board has taken a kill.</p>
        </div>
      ) : (
        <ol className="ladder-list">
          {entries.map(e => (
            <li key={e.userId} className={`ladder-row${e.isYou ? ' is-you' : ''}`}>
              <span className="ladder-rank">{e.rank}</span>
              <span className="ladder-name" style={{ color: factionNameColor(e.faction) }}>
                {/* The board is the one place you see both factions listed together, so it
                    is the place the colour rule earns the most — and the crossed swords
                    mark the rows you would be able to attack in the world. */}
                {isHostile(e.faction, myFaction) ? `${HOSTILE_MARK} ` : ''}{e.name}
                {e.isYou && <span className="ladder-you"> you</span>}
              </span>
              <span className="ladder-meta">
                {e.honorKills} kill{e.honorKills === 1 ? '' : 's'}
                <span className="ladder-circuit"> · Lv {e.level}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Your own duel history — the "about me" half, kept deliberately separate from the board. */
function RecordTab({ history }: { history: DuelResponse[] | null }) {
  const me = currentSession()?.userId ?? null

  if (history === null) return <div className="ladder-empty"><p>Loading your record…</p></div>
  if (history.length === 0) {
    return (
      <div className="ladder-empty">
        <p>No duels yet.</p>
        <p className="ladder-hint">Challenge someone from the ladder.</p>
      </div>
    )
  }

  let won = 0
  for (const d of history) {
    const iChallenged = d.challenger_id === me
    if ((iChallenged && d.winner === 0) || (!iChallenged && d.winner === 1)) won++
  }

  return (
    <div className="ladder-record">
      <div className="ladder-tally">
        <strong>{won}</strong>–<strong>{history.length - won}</strong>
        <span className="ladder-hint"> over {history.length} duel{history.length === 1 ? '' : 's'}</span>
      </div>
      <ol className="ladder-list">
        {history.map(d => {
          const iChallenged = d.challenger_id === me
          const playerWon = (iChallenged && d.winner === 0) || (!iChallenged && d.winner === 1)
          const foe = iChallenged ? d.defender : d.challenger
          return (
            <li key={d.duel_id} className="ladder-row">
              <span className={`ladder-rank${playerWon ? ' won' : ' lost'}`}>
                {playerWon ? 'W' : 'L'}
              </span>
              <span className="ladder-name">{foe?.combatant?.name ?? 'Unknown'}</span>
              <span className="ladder-meta">Lv {foe?.combatant?.level ?? '—'}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * The ladder as a modal, raised from the Looks/Ladder strip.
 *
 * Portalled to `<body>` for the same reason `WardrobePanel` is: the mobile HERO drawer
 * animates with `transform`, and a transformed ancestor becomes the containing block for
 * `position: fixed` descendants — rendered in place this would be clipped to the drawer's
 * ~75% column instead of covering the screen.
 */
export function LadderModal({ onClose }: { onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null)
  useDismissable(true, onClose, { ref: surface, closeOnOutside: true, trapFocus: true })

  return createPortal(
    <div
      // Stable hook for tools/uitest, matching the `wardrobe` convention — keying off
      // visible copy would couple the suite to wording that is still moving.
      data-surface="ladder"
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + var(--safe-t)) 16px calc(16px + var(--safe-b))',
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-label="The ladder"
        className="rp-glass ladder-modal"
      >
        <LadderPanel onClose={onClose} />
        <button
          onClick={onClose}
          className="rp-button"
          style={{ marginTop: 8, width: '100%', fontSize: '0.7rem', minHeight: 40 }}
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** Where the player currently sits, for a compact readout elsewhere. */
export function useOwnPower(): number {
  const state = useGameStore(s => s)
  return buildSnapshot(state).power
}
