// ── PvP: killing the other banner ─────────────────────────────────────────────
//
// Factions used to be flavour. You could read a hero's allegiance on their nameplate, you
// could be turned down for a group because of it, and that was the whole of it — the other
// side was scenery you were not allowed to touch, which is the least interesting thing a
// faction can be.
//
// This module makes the other side KILLABLE, and it does it by turning an enemy-faction
// hero into an ordinary `MobInstance`. That reuse is the entire design decision, so it is
// worth stating why rather than leaving it as an implementation detail:
//
//   Everything a hostile player needs, a mob already has. A position on the 64×64 torus.
//   An HP pool and a swing timer. Aggro, pathing, leashing. A slot in `state.mobs`, which
//   is what lets retaliation, ally assist, DoT ticks, the renderer and `nearestMob` all
//   see them without a single one of those systems learning a new concept. A parallel
//   "hostile players" collection would have been a second copy of combat resolution, and
//   two copies of combat resolution drift — that is not a prediction, it is what happened
//   to the ambient crowd's fights before `engine/fight` was shared.
//
// ── What is deliberately NOT reused ───────────────────────────────────────────
// The payout. A PvP kill awards HONOR and nothing else: no XP, no gold, no drops, no zone
// kill count, no boss progress. This is the owner's call and it is a good one, because it
// keeps PvP entirely outside `econSim`'s model. A hero kill that paid loot would be a
// faucet whose rate depends on how many ambient heroes of the wrong colour happen to be
// standing in the zone — which is to say, a faucet nobody can balance. Honor is its own
// currency on its own ladder, and the gold curve never has to know PvP shipped.
//
// The corollary is that an enemy player is not a grinding target. They fight back with a
// real hero's stat block, they cost you HP and time, and they pay you nothing you can
// spend. What you get is the number on the honor ladder. That is the trade.

import type {
  ClassType, FactionType, Item, MobInstance, PvpIdentity, PvpRecord, RaceType, Rarity, Slot,
} from '../data/types'
import type { AmbientIdentity } from './ambient'
import { CLASS_DEFINITIONS } from '../data/classes'
import { RACE_DEFINITIONS } from '../data/races'
import { compileStats } from './combat'
import type { ChatSpeaker } from './chatGen'
import { entityKey } from './whisper'

/** The zeroed record. Every save written before PvP existed gets one of these. */
export function emptyPvpRecord(): PvpRecord {
  return { kills: 0, deaths: 0, killsByFaction: {}, streak: 0, bestStreak: 0, lastVictim: null }
}

/** Tolerant read for a save that predates the field, so no caller has to null-check. */
export function readPvpRecord(r: PvpRecord | undefined | null): PvpRecord {
  if (!r) return emptyPvpRecord()
  return {
    kills: r.kills ?? 0,
    deaths: r.deaths ?? 0,
    killsByFaction: r.killsByFaction ?? {},
    streak: r.streak ?? 0,
    bestStreak: r.bestStreak ?? 0,
    lastVictim: r.lastVictim ?? null,
  }
}

/**
 * How hard an enemy player hits, and how much of them there is.
 *
 * Built from `compileStats` — the SAME function that builds the player — rather than from
 * a mob template, because the promise this feature makes is that you are fighting a
 * character, not a reskinned wolf. An enemy hero at your level should feel like your
 * mirror: comparable HP, comparable damage, and a class that behaves like that class.
 *
 * They fight unequipped, matching `engine/duel`'s rule for ambient heroes: giving them
 * real loadouts means generating items, and items are the player's economy. The multiplier
 * below is what makes up the difference so an unequipped hero is not free honor.
 */
const PVP_HP_MULT = 1.35
const PVP_DAMAGE_MULT = 1.15
/** Rarity is the ambient crowd's "how notable is this one" roll; a legendary-tier enemy
 *  player is the PvP equivalent of an elite, and reads as one on their nameplate. */
const RARITY_POWER: Record<Rarity, number> = {
  common: 1, uncommon: 1.08, rare: 1.18, epic: 1.3, legendary: 1.5,
}

let pvpSeq = 0

export interface PvpMobInput {
  name: string
  level: number
  race: RaceType
  playerClass: ClassType
  faction: FactionType
  rarity: Rarity
  spec: string | null
  talentAllocs: Record<string, number>
  sourceKey: string
  /** Friendly duel rather than a faction fight — see `PvpIdentity.duel`. */
  duel?: boolean
  /**
   * The opponent's REAL equipment, when there is any.
   *
   * Present only for a ghost (a real player's published character). An ambient hero fights
   * unequipped, per the standing rule that generating loadouts for scenery would mean
   * generating items, and items are the player's economy — see the multipliers below for
   * how that difference is paid for.
   */
  equipment?: Record<Slot, Item | null>
  /** Owner's `user_id` for a ghost. */
  ghostUserId?: string
}

/** Normalise an ambient hero into the shape `buildPvpMob` wants. */
export function fromAmbient(id: AmbientIdentity, sourceKey: string, duel = false): PvpMobInput {
  return {
    name: id.name,
    level: id.level,
    race: id.race,
    playerClass: id.playerClass,
    faction: id.faction,
    rarity: id.rarity,
    spec: id.specTitle,
    talentAllocs: id.talentAllocs,
    sourceKey,
    duel,
  }
}

/**
 * Normalise a tapped `ChatSpeaker` into the same shape.
 *
 * A speaker carries a faction as a DISPLAY STRING and its race/class as loose strings,
 * because it was built for prompting a language model rather than for the simulation. The
 * caller resolves the faction key (it has `resolveFaction` and the registry); everything
 * else is coerced here, defensively, since a bad class id would otherwise reach
 * `compileStats` and produce a mob with NaN health.
 */
export function fromSpeaker(
  s: ChatSpeaker, faction: FactionType, rarity: Rarity = 'common', duel = false,
): PvpMobInput {
  const cls = (CLASS_DEFINITIONS as Record<string, unknown>)[s.playerClass]
    ? (s.playerClass as ClassType) : 'warrior'
  const race = (RACE_DEFINITIONS as Record<string, unknown>)[s.race]
    ? (s.race as RaceType) : 'human'
  return {
    name: s.name,
    level: Math.max(1, Math.round(s.level || 1)),
    race,
    playerClass: cls,
    faction,
    rarity,
    spec: s.spec ?? null,
    talentAllocs: s.talentAllocs ?? {},
    sourceKey: entityKey(s),
    duel,
  }
}

const EMPTY_EQUIPMENT: Record<Slot, Item | null> = {
  weapon: null, helm: null, chest: null, legs: null, boots: null, trinket: null,
}

/**
 * Build the combat body for an enemy player.
 *
 * `placement` is supplied by the store because placing something in the world needs the
 * walk mask and the player's tile position, and neither of those may be imported here —
 * this module sits on the engine side of the same isolation rule the rest of the living
 * world obeys.
 */
export function buildPvpMob(
  input: PvpMobInput,
  placement: Pick<MobInstance,
    'pos' | 'home' | 'patrolTarget' | 'patrolPause' | 'aggro' | 'aggroRadius' | 'offset'
    | 'path' | 'pathCool'>,
): MobInstance {
  const racial = RACE_DEFINITIONS[input.race]?.racialPassive ?? {}
  const equipment = input.equipment ?? EMPTY_EQUIPMENT
  const stats = compileStats(input.playerClass, input.level, equipment, input.talentAllocs, racial)
  // A GHOST wears real gear, so the compensation below would double-count: they would get
  // both their items and the allowance that exists precisely because an ambient hero has
  // none. A real player's character is already exactly as strong as it is.
  const geared = input.equipment != null
  const hpMult = geared ? 1 : PVP_HP_MULT
  const dmgMult = geared ? 1 : PVP_DAMAGE_MULT
  // Rarity is the ambient crowd's notability roll and means nothing for a real character;
  // their gear IS their notability.
  const power = geared ? 1 : (RARITY_POWER[input.rarity] ?? 1)
  const hp = Math.max(1, Math.round(stats.maxHp * hpMult * power))
  const identity: PvpIdentity = {
    faction: input.faction,
    race: input.race,
    playerClass: input.playerClass,
    rarity: input.rarity,
    level: input.level,
    spec: input.spec,
    sourceKey: input.sourceKey,
    duel: !!input.duel,
    ghostUserId: input.ghostUserId,
  }
  return {
    id: `pvp_${++pvpSeq}`,
    // `templateId` is read by `resolveMobSprite` and by the zone kill ledger. Neither
    // should ever see a PvP body — the renderer branches on `pvp` before it asks for a
    // sprite, and `registerKill` returns before it touches the ledger — but it is typed
    // as a MobId, so it gets a real one rather than a lie that could index something.
    templateId: 'meadow_wolf' as MobInstance['templateId'],
    // The name IS the presentation. Crossed swords rather than a rarity star: what matters
    // about this body at a glance is that it is a person on the other side, not its tier.
    // A duel opponent gets no marker — they are not an enemy, they are a sparring partner,
    // and marking them would put the "you may kill this" signal on someone you may not.
    name: input.duel ? input.name : `⚔ ${input.name}`,
    baseName: input.name,
    currentHp: hp,
    maxHp: hp,
    // `damage` on a MobInstance is a DPS figure, not a per-swing one — `resolveMobAttack`
    // deals `damage × attackSpeedSeconds`, so attack speed cancels out of the rate. The
    // hero's own throughput is `weaponDps` for exactly the same reason, which makes the
    // two directly comparable: an enemy player hits about as hard as you do.
    damage: Math.max(1, Math.round(stats.weaponDps * dmgMult * power)),
    // Zero, all three, and this is load-bearing rather than a default: `registerKill`
    // returns before the payout block for a PvP body, but `rollLoot` is also reachable
    // from the Umbral Bolt execute path (see gameStore's finishCast), and a nonzero table
    // there would quietly pay loot for a kill this design says pays none.
    xpReward: 0,
    goldMin: 0,
    goldMax: 0,
    lootTableIds: [],
    spriteKey: 'hero',
    attackSpeedSeconds: stats.attackSpeedSeconds,
    isElite: false,
    isBoss: false,
    ...placement,
    dots: [],
    attackAccum: 0,
    pvp: identity,
  }
}

/** Fold a kill into the record. Pure, so the store can call it inside its tick patch. */
export function recordKill(record: PvpRecord, victim: { name: string; faction: FactionType }): PvpRecord {
  const r = readPvpRecord(record)
  const streak = r.streak + 1
  return {
    kills: r.kills + 1,
    deaths: r.deaths,
    killsByFaction: { ...r.killsByFaction, [victim.faction]: (r.killsByFaction[victim.faction] ?? 0) + 1 },
    streak,
    bestStreak: Math.max(r.bestStreak, streak),
    lastVictim: victim.name,
  }
}

/** Fold a death-to-a-player into the record. A death breaks the streak, not the best one. */
export function recordDeath(record: PvpRecord): PvpRecord {
  const r = readPvpRecord(record)
  return { ...r, deaths: r.deaths + 1, streak: 0 }
}

/**
 * Honor rank titles.
 *
 * Vanilla's rank ladder is the reference, compressed hard: fourteen ranks over a grind
 * measured in months is a shape that needs a population this game does not have. Six
 * titles over a few hundred kills gives the same thing the ranks actually did — a name for
 * where you are — without pretending to a season structure that isn't there.
 */
const HONOR_RANKS: { at: number; title: string }[] = [
  { at: 0, title: 'Unranked' },
  { at: 1, title: 'Skirmisher' },
  { at: 10, title: 'Bloodied' },
  { at: 25, title: 'Reaver' },
  { at: 60, title: 'Bannerbreaker' },
  { at: 120, title: 'Warlord' },
  { at: 250, title: 'Scourge of the Line' },
]

export function honorRank(kills: number): string {
  let title = HONOR_RANKS[0].title
  for (const r of HONOR_RANKS) if (kills >= r.at) title = r.title
  return title
}

/** Kills still needed for the next title, and what it is. Null at the top. */
export function nextHonorRank(kills: number): { title: string; remaining: number } | null {
  for (const r of HONOR_RANKS) {
    if (kills < r.at) return { title: r.title, remaining: r.at - kills }
  }
  return null
}

// ── Who is standing in `mobs` instead of in the crowd ─────────────────────────
//
// An enemy player exists in two places at once the moment you attack them: the ambient
// crowd still holds the hero you tapped (the renderer owns that population, and it is
// seeded from the zone rather than from the store), and `state.mobs` now holds the body
// that fights you. Drawn naively, that is the same person twice, three tiles apart.
//
// This registry is how the renderer knows to stand one of them down. It is keyed by
// `entityKey`, deliberately module-level rather than on `GameState`, for the same reason
// the rest of the ambient stack is: the crowd is not the player's state, and routing a
// rendering concern through the save file would put scenery in the economy's blast radius.
const engagedKeys = new Set<string>()
/** Keys whose owner is dead, with the wall-clock time they may return. */
const downedUntil = new Map<string, number>()

/** How long a slain enemy player stays out of the crowd. Long enough that they do not pop
 *  back the instant their corpse fades, short enough that a zone does not empty out. */
export const PVP_RESPAWN_SECONDS = 90

export function markEngaged(key: string): void {
  engagedKeys.add(key)
}

export function markDowned(key: string): void {
  engagedKeys.delete(key)
  downedUntil.set(key, Date.now() + PVP_RESPAWN_SECONDS * 1000)
}

/** Released without a kill — they got away, or the player travelled. */
export function markDisengaged(key: string): void {
  engagedKeys.delete(key)
}

/** Should the crowd hide this hero? True while they are fighting you as a mob, and while
 *  their body is still cooling. */
export function isSuppressed(key: string): boolean {
  if (engagedKeys.has(key)) return true
  const until = downedUntil.get(key)
  if (until === undefined) return false
  if (Date.now() >= until) { downedUntil.delete(key); return false }
  return true
}

/** Travelling regenerates the crowd from a new zone seed, so the old keys mean nothing.
 *  Called on zone change for the same reason the party disbands there. */
export function clearPvpSuppression(): void {
  engagedKeys.clear()
  downedUntil.clear()
}

// ── Being attacked ────────────────────────────────────────────────────────────
//
// PvP that only ever starts when the player presses a button is a menu, not a war. The
// other faction has to be able to open on YOU — otherwise the enemy colour on a nameplate
// is a label for a thing you may optionally farm, and walking through their half of the
// zone costs nothing.
//
// What follows is the model for whether an enemy hero decides to try you. Three inputs,
// in descending order of how much they matter:
//
//   1. **Race enmity.** Some pairings are old grudges and some are merely the wrong
//      banner. An orc who sees a dwarf is a different proposition from an orc who sees an
//      elf, and this is the dial that makes the world's factions feel populated by peoples
//      rather than by two colours.
//   2. **Nerve.** Nobody picks a fight they will obviously lose. A hero well below the
//      player mostly keeps walking; one well above is emboldened. This is also the safety
//      valve on the feature: it is what stops a low-level player being farmed by the
//      crowd, without needing a special case that says so.
//   3. **Proximity.** They have to be close enough to have noticed you at all.
//
// Everything here is a pure function of those inputs plus a seeded roll, so a hero who
// decides to jump you does it for a reason that can be read off the numbers rather than
// because a `Math.random()` came up short.

/**
 * How much each race dislikes each other race, 0–1.
 *
 * Read as "attacker's row, victim's column"; asymmetric on purpose, because grudges are.
 * A goblin is an opportunist rather than a zealot — they attack what looks profitable, not
 * what they hate — while an orc and a dwarf have been killing each other for long enough
 * that neither needs a reason.
 *
 * Same-faction pairs never reach this table (the caller filters on `isHostile` first), so
 * the diagonal and the intra-faction cells are unused and left at the base value.
 */
const BASE_ENMITY = 0.35
const RACE_ENMITY: Partial<Record<RaceType, Partial<Record<RaceType, number>>>> = {
  // Ashmarch → Concord
  orc:    { dwarf: 0.95, human: 0.8,  elf: 0.55 },
  troll:  { elf: 0.95,   human: 0.6,  dwarf: 0.5 },
  goblin: { dwarf: 0.6,  human: 0.45, elf: 0.4 },
  // Concord → Ashmarch
  dwarf:  { orc: 0.95,   troll: 0.5,  goblin: 0.7 },
  elf:    { troll: 0.95, orc: 0.5,    goblin: 0.4 },
  human:  { orc: 0.8,    troll: 0.6,  goblin: 0.5 },
}

/** How much one race dislikes another, before nerve and distance. */
export function raceEnmity(attacker: RaceType, victim: RaceType): number {
  return RACE_ENMITY[attacker]?.[victim] ?? BASE_ENMITY
}

/** Beyond this many tiles they have not noticed you and nothing is rolled. */
export const GANK_NOTICE_TILES = 11
/** Minimum seconds between unprovoked attacks, globally. */
export const GANK_COOLDOWN_SECONDS = 75
/** Per-second chance at maximum enmity, point blank, against someone they fancy their
 *  odds against. Deliberately small: this is a thing that should happen a few times an
 *  hour and be memorable, not a tax on every zone crossing. */
const GANK_BASE_RATE = 0.02

let lastGankAt = 0

/** Has enough time passed since the last unprovoked attack? */
export function gankReady(now: number): boolean {
  return now - lastGankAt >= GANK_COOLDOWN_SECONDS * 1000
}

export function markGank(now: number): void {
  lastGankAt = now
}

/** Reset with the zone, like the suppression registry — a new crowd starts on a clean
 *  clock rather than inheriting a cooldown from people who are no longer here. */
export function resetGankClock(): void {
  lastGankAt = 0
}

/**
 * Would this hero open on the player, this tick?
 *
 * `step` is the elapsed time the roll covers, so the rate reads as "per second" no matter
 * what cadence the caller thinks at — the ambient brain runs at 5Hz today and that should
 * not be baked into the tuning.
 *
 * Nerve is a level ratio rather than a difference so it stays meaningful across the whole
 * curve: five levels is a gulf at level 8 and noise at level 60.
 */
export function wouldAttackUnprovoked(
  attacker: { race: RaceType; level: number },
  player: { race: RaceType; level: number },
  distanceTiles: number,
  step: number,
  rng: () => number,
): boolean {
  if (distanceTiles > GANK_NOTICE_TILES) return false
  const enmity = raceEnmity(attacker.race, player.race)
  // Nerve: 1.0 when they match or outclass the player, falling away as they are
  // out-levelled, and gone entirely below two thirds of the player's level. A hero who
  // would simply be executed does not start the fight.
  const ratio = attacker.level / Math.max(1, player.level)
  if (ratio < 0.67) return false
  const nerve = Math.min(1, (ratio - 0.67) / 0.33)
  // Closer is bolder — someone across the clearing is far less likely to commit than
  // someone you just walked past.
  const closeness = 1 - distanceTiles / GANK_NOTICE_TILES
  const rate = GANK_BASE_RATE * enmity * nerve * closeness
  return rng() < rate * step
}
