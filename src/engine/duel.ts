// Friendly duels against an ambient hero.
//
// This is Track P's ghost-PvP mechanic, running a lap early against a LOCAL opponent:
// take two roster snapshots, run the seeded `runFight`, and show the result. The only
// thing P0 adds later is fetching the opponent from a cloud store instead of from the
// crowd standing next to you — so this doubles as the de-risking prototype for
// "fetch 3 opponents, run the seeded sim, render the fight in the dimetric scene".
//
// ── Nothing here touches the player's state ───────────────────────────────────
// A duel is FRIENDLY: no HP is lost, no XP is gained, nothing drops, no gold moves. The
// player's roster is read to build a combatant and is never written back. That keeps the
// standing ambient-hero rule intact and, incidentally, keeps duels out of the economy —
// a duel that paid out would be a gold faucet the balance pass never modelled.

import type { GameState } from '../data/types'
import { runFight, type FightResult, type HeroCombatant } from './fight'
import type { ChatSpeaker } from './chatGen'
import { pushChat } from './chatLog'
import { hashSeed } from './rng'
import { RACE_DEFINITIONS } from '../data/races'

/** Build the player's combatant from live state. Read-only. */
export function playerCombatant(s: GameState): HeroCombatant {
  return {
    name: s.playerName || 'You',
    playerClass: s.playerClass,
    level: s.level,
    equipment: s.equipment,
    talentAllocs: s.talentAllocs,
    racialPassive: RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {},
  }
}

export interface DuelOutcome {
  result: FightResult
  playerWon: boolean
  opponent: string
  /** A few readable beats from the fight, for the chat summary. */
  highlights: string[]
}

/**
 * Resolve a duel and post it to chat.
 *
 * ── No longer how a LOCAL duel works ─────────────────────────────────────────
 * Tapping a hero and choosing Duel now spawns a real body in the world and fights it
 * through the ordinary combat loop (`gameStore.duelPlayer`), because an instantly-resolved
 * duel was the only fight in the game the player never got to watch — three lines of chat
 * where every other encounter is a thing happening in front of you.
 *
 * This function stays because the CLOUD duel is a genuinely different problem: the
 * opponent is a snapshot in a database, not a body standing next to you, and there is
 * nothing to render them into. `playerCombatant` above is also what `net/snapshot` builds
 * a published row from. Neither should be deleted on the strength of the local path
 * changing shape.
 *
 * Deterministic in its seed like every other fight, so the same duel replays identically —
 * which is the property Track P actually needs and the reason this is worth building on
 * `runFight` rather than faking a result.
 */
export function runDuel(state: GameState, opponent: ChatSpeaker): DuelOutcome {
  const player = playerCombatant(state)
  const foe: HeroCombatant = {
    name: opponent.name,
    playerClass: opponent.playerClass as HeroCombatant['playerClass'],
    level: opponent.level,
    // Ambient heroes fight unequipped — their power is level + spec. Giving them real
    // loadouts would mean generating items, which is the player's economy.
    equipment: { weapon: null, helm: null, chest: null, legs: null, boots: null, trinket: null },
    talentAllocs: opponent.talentAllocs ?? {},
  }

  // Seed from both identities so a given matchup is stable, plus the wall clock so a
  // rematch is a different fight rather than a replay of the same one.
  const seed = (hashSeed(`${player.name}:${foe.name}:${Date.now()}`)) >>> 0
  const result = runFight(seed, player, foe, { stepSeconds: 0.25, maxSeconds: 60, maxEvents: 256 })
  const playerWon = result.winner === 0

  const crits = result.events.filter(e => e.crit).length
  const biggest = result.events.reduce((m, e) => Math.max(m, e.damage), 0)
  const highlights = [
    `${result.duration.toFixed(0)}s, ${result.events.length} exchanges`,
    crits ? `${crits} crit${crits === 1 ? '' : 's'}` : 'no crits',
    biggest ? `biggest hit ${biggest}` : '',
  ].filter(Boolean)

  pushChat({
    channel: 'system', from: null,
    text: playerWon
      ? `You defeated ${opponent.name} in a duel. (${highlights.join(' · ')})`
      : `${opponent.name} defeated you in a duel. (${highlights.join(' · ')})`,
  })

  return { result, playerWon, opponent: opponent.name, highlights }
}
