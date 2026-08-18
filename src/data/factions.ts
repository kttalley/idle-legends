import type { FactionType } from './types'

export interface FactionDefinition {
  id: FactionType
  name: string
  color: string          // primary accent color
  opposingFaction: FactionType | null
  description: string
  motto: string
}

export const FACTION_DEFINITIONS: Record<FactionType, FactionDefinition> = {
  alliance: {
    id: 'alliance',
    name: 'The Lastlight Concord',
    color: '#4a90d9',
    opposingFaction: 'horde',
    description: 'Oath-bound kingdoms of humans, dwarves, and elves holding the last light against the dark.',
    motto: 'Hold the last light.',
  },

  horde: {
    id: 'horde',
    name: 'The Ashmarch',
    color: '#c0392b',
    opposingFaction: 'alliance',
    description: 'Orcs, trolls, and goblins forged by fire and loss into one unstoppable column.',
    motto: 'Ash behind us, fire ahead.',
  },

  neutral: {
    id: 'neutral',
    name: 'Neutral',
    color: '#b8a070',
    opposingFaction: null,
    description: 'Those who walk between factions — gnomes and hornborn who answer to no banner.',
    motto: 'Gold has no allegiance.',
  },
}

// ── One place that decides what colour a name is ──────────────────────────────
//
// Before this block, "what colour is that name" was answered independently in six files:
// the canvas nameplate rasteriser, the target card, the chat feed, the town crowd, the
// character select list and the ladder. They disagreed — the card and the nameplate used
// `#ff8a7a`/`#8ac0ff`, `TownView` used the deep `FACTION_DEFINITIONS.color` crest values,
// and the ladder used none at all — which meant the same hero read as a different
// allegiance depending on which surface you were looking at. With PvP, that is no longer
// cosmetic: colour is now the signal for "I can kill this", so it has to be one answer.
//
// The crest colours above stay as they are — they are the deep banner tones used for
// fills and borders. These are the TEXT tones: the same hues lifted until they hold up as
// small type over a dark, noisy world.

/** Name-text colour, by faction. Ashmarch red, Concord blue, unaligned gold — everywhere. */
export const FACTION_NAME_COLOR: Record<FactionType, string> = {
  alliance: '#8ac0ff',
  horde: '#ff8a7a',
  neutral: '#c8b48a',
}

/** The dimmer variant, for the sub-line under a name (faction label, level, class). */
export const FACTION_NAME_COLOR_DIM: Record<FactionType, string> = {
  alliance: '#7f9fbf',
  horde: '#c07070',
  neutral: '#9a8f7a',
}

/** Prefix marking someone you can attack. Crossed swords, as it reads in every MMO. */
export const HOSTILE_MARK = '⚔'

/**
 * Generated faction display names, mirrored here from the store.
 *
 * Faction names are rolled per playthrough (`engine/nameGen`), so a `ChatSpeaker` carries
 * a STRING like "The Cinderoath Column" rather than the `horde` key. Every surface that
 * needs to know whether a speaker is hostile was therefore doing string comparison against
 * whatever name it happened to have to hand — and `PlayerCard` compared against the
 * player's own faction name, so a NEUTRAL speaker read as hostile.
 *
 * Registering the names once, from the store, lets `resolveFaction` turn any of the three
 * forms (key, generated name, canonical name) back into a key. Kept as a module-level
 * registry rather than a hook because the callers include the canvas adapter and the
 * whisper engine, neither of which is React.
 */
let generatedNames: Partial<Record<FactionType, string>> = {}

export function registerFactionNames(names: Partial<Record<FactionType, string>> | undefined): void {
  if (names) generatedNames = names
}

/** Display name for a faction — the generated one when there is one. */
export function factionLabel(f: FactionType): string {
  return generatedNames[f] || FACTION_DEFINITIONS[f].name
}

/**
 * Coerce whatever a caller has — a key, a generated name, a canonical name — to a key.
 *
 * Falls back to `neutral` rather than guessing, because the cost of guessing wrong is a
 * hostile marker on a friendly hero (or worse, an attack button on one).
 */
export function resolveFaction(value: string | null | undefined): FactionType {
  if (!value) return 'neutral'
  const v = value.trim().toLowerCase()
  if (v === 'alliance' || v === 'horde' || v === 'neutral') return v
  for (const f of ['alliance', 'horde', 'neutral'] as FactionType[]) {
    if (generatedNames[f]?.trim().toLowerCase() === v) return f
    if (FACTION_DEFINITIONS[f].name.trim().toLowerCase() === v) return f
  }
  return 'neutral'
}

/** Text colour for any faction-ish value. */
export function factionNameColor(value: string | FactionType | null | undefined): string {
  return FACTION_NAME_COLOR[resolveFaction(value as string)]
}

export function factionNameColorDim(value: string | FactionType | null | undefined): string {
  return FACTION_NAME_COLOR_DIM[resolveFaction(value as string)]
}

/**
 * Are these two at war?
 *
 * Only alliance↔horde is hostile. Neutral is hostile to nobody and nobody is hostile to
 * it — the unaligned races are merchants and mercenaries, and making them killable would
 * put the town vendors on the wrong end of a rotation.
 */
export function isHostile(
  a: string | FactionType | null | undefined,
  b: string | FactionType | null | undefined,
): boolean {
  const fa = resolveFaction(a as string)
  const fb = resolveFaction(b as string)
  if (fa === 'neutral' || fb === 'neutral') return false
  return fa !== fb
}

/** Can these two group up? Same banner only — see `engine/party`. */
export function canGroupWith(
  a: string | FactionType | null | undefined,
  b: string | FactionType | null | undefined,
): boolean {
  return resolveFaction(a as string) === resolveFaction(b as string)
}
