// ── The Undermaw: floor generation and depth scaling (Phase 0) ────────────────
//
// Pure module: no store, no DOM. The design is docs/UNDERMAW.md. Phase 0 is sim-only: this
// file plus src/sim/undermawSim.ts exist to tune the curve against real saves before any
// UI is built, so nothing in the live game imports it yet.
//
// A floor is a seeded remix: one to three biomes from the 12 zones, an enemy roster drawn
// from those biomes (plus the odd stranger from anywhere), and a zone boss renamed for the
// depths. Enemies keep their sprites, names and attack speeds, but every template is first
// NORMALISED to the final zone's strength, so a Sunhollow wolf on floor 40 is as dangerous
// as a Maw enemy on floor 40. Without that, the remix would be a lottery: early-zone
// templates have a few dozen HP and the final zone's have thousands.

import { ZONES, ZONE_ORDER } from '../data/zones'
import type { MobInstance, MobTemplate, ZoneId } from '../data/types'
import { BOSS_HP_MULTIPLIER, BOSS_DAMAGE_MULTIPLIER } from '../data/constants'
import { xpForLevel } from './progression'

/**
 * The tuning knobs, in one mutable object so the sim can sweep them without a rebuild.
 * Nothing in the live game reads this yet; when it does, it reads these values as shipped.
 *   growth          enemy strength factor per floor (UNDERMAW.md 7.1: ~1.015 to 1.02)
 *   base            floor 1 sits a step above the final zone on circuit 0
 *   levelsPerFloor  how much each floor raises the level limit (3.3)
 *   levelFloor      the level limit at floor 0, where the first lap's XP line already sits
 */
export const UNDERMAW = { growth: 1.018, base: 1.25, levelsPerFloor: 2, levelFloor: 110 }
/** Kills per floor before the floor boss appears. */
export const FLOOR_KILLS = 30
/** The season seed. Fixed: same floors for everyone (UNDERMAW.md 7.4). */
export const UNDERMAW_SEED = 0x51a11

export function depthMult(depth: number): number {
  return UNDERMAW.base * Math.pow(UNDERMAW.growth, Math.max(0, depth - 1))
}

/** The level a floor teaches up to: past it, its kills pay no XP. */
export function floorLevelLimit(depth: number): number {
  return UNDERMAW.levelFloor + UNDERMAW.levelsPerFloor * depth
}

/** Deterministic per-floor stream (mulberry32), so a floor is the same for everyone. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ZONE_IDS = ZONE_ORDER as ZoneId[]
const FINAL_ZONE = ZONE_IDS[ZONE_IDS.length - 1]

/** Mean trash stats of a zone (boss excluded): the yardstick for normalising its templates. */
function zoneMeans(z: ZoneId) {
  const cfg = ZONES[z]
  const trash = cfg.mobs.filter(m => m.id !== cfg.bossId)
  const mean = (k: 'hp' | 'damage' | 'xpReward') => trash.reduce((s, m) => s + m[k], 0) / trash.length
  return { hp: mean('hp'), damage: mean('damage'), xp: mean('xpReward') }
}
const REF = zoneMeans(FINAL_ZONE)
const MEANS = Object.fromEntries(ZONE_IDS.map(z => [z, zoneMeans(z)])) as Record<ZoneId, ReturnType<typeof zoneMeans>>

export interface FloorEnemy { template: MobTemplate; zone: ZoneId }

export interface UndermawFloor {
  depth: number
  biomes: ZoneId[]
  roster: FloorEnemy[]
  boss: FloorEnemy & { title: string }
  /** Placeholder until affixes land in P2; the generator already reserves the slot. */
  affixes: string[]
  killTarget: number
  levelLimit: number
  mult: number
}

const EPITHETS = ['Undermaw-born', 'of the Deep Gullet', 'the Swallowed', 'Hollow-crowned',
  'the Unlit', 'of the Long Fall', 'Maw-touched', 'the Returned']

/**
 * Generate floor `depth`. Same seed and depth, same floor, on every device.
 * Biomes: 1 to 3, favouring neighbours in the zone order so blends read as a place.
 */
export function generateFloor(depth: number, seed = UNDERMAW_SEED): UndermawFloor {
  const r = rng((seed ^ Math.imul(depth, 0x9e3779b9)) >>> 0)
  const count = 1 + Math.floor(r() * 3)
  const start = Math.floor(r() * ZONE_IDS.length)
  const biomes: ZoneId[] = []
  for (let i = 0; i < count; i++) biomes.push(ZONE_IDS[(start + i) % ZONE_IDS.length])

  const pool: FloorEnemy[] = biomes.flatMap(z =>
    ZONES[z].mobs.filter(m => m.id !== ZONES[z].bossId).map(template => ({ template, zone: z })))
  const roster: FloorEnemy[] = []
  const want = Math.min(pool.length, 3 + Math.floor(r() * 3))
  const bag = [...pool]
  while (roster.length < want && bag.length) roster.push(bag.splice(Math.floor(r() * bag.length), 1)[0])
  // One stranger from anywhere, now and then: the "something is wrong down here" note.
  if (r() < 0.25) {
    const z = ZONE_IDS[Math.floor(r() * ZONE_IDS.length)]
    const trash = ZONES[z].mobs.filter(m => m.id !== ZONES[z].bossId)
    roster.push({ template: trash[Math.floor(r() * trash.length)], zone: z })
  }

  const bossZone = biomes[Math.floor(r() * biomes.length)]
  const bossTemplate = ZONES[bossZone].mobs.find(m => m.id === ZONES[bossZone].bossId)!
  const title = `${bossTemplate.name}, ${EPITHETS[Math.floor(r() * EPITHETS.length)]}`

  return {
    depth, biomes, roster,
    boss: { template: bossTemplate, zone: bossZone, title },
    affixes: [],
    killTarget: FLOOR_KILLS,
    levelLimit: floorLevelLimit(depth),
    mult: depthMult(depth),
  }
}

/**
 * Kill XP in the Undermaw. The pacing rule (UNDERMAW.md 3.3) is about the HERO's level:
 * a level takes `killsPerLevel` kills at level `levelFloor`, doubling every `doubleEvery`
 * levels, wherever it is earned. The floor only caps it: at or past a floor's level limit
 * its kills pay nothing, so going deeper is what keeps levelling open.
 */
export function floorKillXp(depth: number, heroLevel: number, killsPerLevel: number,
                            doubleEvery = 99, isBoss = false): number {
  if (heroLevel >= floorLevelLimit(depth)) return 0
  const kpl = doubleEvery
    ? killsPerLevel * Math.pow(2, Math.max(0, heroLevel - UNDERMAW.levelFloor) / doubleEvery)
    : killsPerLevel
  return Math.max(1, Math.round((xpForLevel(heroLevel) / kpl) * (isBoss ? 10 : 1)))
}

/**
 * Build a fightable enemy for a floor, the same shape `spawnMob` produces in the store, with
 * depth scaling in place of circuit scaling. `soften` divides health and damage: the
 * permanent Undermaw boost is modelled on the enemy side, which is equivalent and keeps
 * the hero's own stat compilation untouched.
 */
export function makeFloorMob(e: FloorEnemy, depth: number, opts: { isBoss?: boolean; soften?: number; title?: string } = {}): MobInstance {
  const m = MEANS[e.zone]
  const isBoss = !!opts.isBoss
  // Bosses normalise against their own zone's trash too, so a boss stays a boss.
  const hpNorm = REF.hp / m.hp, dmgNorm = REF.damage / m.damage
  const mult = depthMult(depth) / (opts.soften ?? 1)
  const hp = Math.max(1, Math.round(e.template.hp * hpNorm * mult * (isBoss ? BOSS_HP_MULTIPLIER : 1)))
  return {
    id: `undermaw_${depth}_${e.template.id}${isBoss ? '_boss' : ''}`,
    templateId: e.template.id,
    name: opts.title ?? e.template.name,
    baseName: e.template.name,
    currentHp: hp, maxHp: hp,
    damage: Math.max(1, Math.round(e.template.damage * dmgNorm * mult * (isBoss ? BOSS_DAMAGE_MULTIPLIER : 1))),
    xpReward: 0, goldMin: 0, goldMax: 0,
    lootTableIds: e.template.lootTableIds,
    spriteKey: e.template.spriteKey,
    attackSpeedSeconds: e.template.attackSpeedSeconds,
    isElite: false, isBoss,
    pos: { x: 0, y: 0 }, home: { x: 0, y: 0 }, patrolTarget: null, patrolPause: 0,
    path: null, pathCool: 0, aggro: true, aggroRadius: 0, offset: { dx: 0, dy: 0 },
    dots: [], attackAccum: 0,
  } as MobInstance
}
