import type { ZoneId, ZoneConfig, FactionType, GameState } from '../data/types'
import { ZONES, ZONE_ORDER } from '../data/zones'
import { FACTION_DEFINITIONS } from '../data/factions'
import { TOWNS, ZONE_TOWN } from '../data/towns'

// ── Zone unlock state ───────────────────────────────────────────────────────

export interface ZoneProgressionState {
  zoneId: ZoneId
  unlocked: boolean
  reason: 'available' | 'locked_boss' | 'locked_level'
  prerequisiteZone?: ZoneId
  requiredLevel: number
}

// Build a map: zoneId -> its prerequisite zone (the one whose boss unlocks this one).
const PREREQ: Record<ZoneId, ZoneId | undefined> = (() => {
  const map: Record<string, ZoneId | undefined> = {}
  for (const zoneId of ZONE_ORDER) {
    const zone = ZONES[zoneId]
    if (!zone) continue
    for (const candidate of ZONE_ORDER) {
      const candZone = ZONES[candidate]
      if (candZone?.nextZone === zoneId) {
        map[zoneId] = candidate as ZoneId
        break
      }
    }
  }
  return map
})()

export function getPrerequisiteZone(zoneId: ZoneId): ZoneId | undefined {
  return PREREQ[zoneId]
}

/** True if the player meets the level and boss requirements to enter the zone. */
export function canEnterZone(
  zoneId: ZoneId,
  level: number,
  bossesDefeated: ZoneId[],
): boolean {
  const zone = ZONES[zoneId]
  if (!zone) return false
  if (level < zone.levelRange[0]) return false
  const prereq = getPrerequisiteZone(zoneId)
  if (prereq && !bossesDefeated.includes(prereq)) return false
  return true
}

/**
 * Full per-zone progression snapshot. Used by ZoneTrack and unlock checks.
 * A zone is considered "unlocked" only when it can actually be entered.
 */
export function getZoneProgression(
  level: number,
  bossesDefeated: ZoneId[],
  unlockedZones: ZoneId[],
): ZoneProgressionState[] {
  return ZONE_ORDER.map(rawId => {
    const zoneId = rawId as ZoneId
    const zone = ZONES[zoneId]
    const prereq = getPrerequisiteZone(zoneId)
    const prereqBossDown = prereq ? bossesDefeated.includes(prereq) : true
    const levelMet = level >= zone.levelRange[0]

    let reason: ZoneProgressionState['reason']
    if (levelMet && prereqBossDown) reason = 'available'
    else if (!prereqBossDown) reason = 'locked_boss'
    else reason = 'locked_level'

    return {
      zoneId,
      unlocked: unlockedZones.includes(zoneId),
      reason,
      prerequisiteZone: prereq,
      requiredLevel: zone.levelRange[0],
    }
  })
}

/** Evaluate a zone that is already known to the player and decide if it should now be unlocked. */
export function shouldUnlockZone(
  zoneId: ZoneId,
  level: number,
  bossesDefeated: ZoneId[],
): boolean {
  return canEnterZone(zoneId, level, bossesDefeated)
}

// ── Quest system ──────────────────────────────────────────────────────────────

export interface ZoneQuest {
  id: string
  zoneId: ZoneId
  title: string
  description: string
  levelReq: number
  killsReq: number
  bossId: string
  rewardZoneId?: ZoneId
  completed: boolean
  claimed: boolean
}

function questTitle(zone: ZoneConfig): string {
  return `Clear ${zone.name}`
}

function questDescription(zone: ZoneConfig, playerFaction: FactionType): string {
  const isHostile = zone.hostileToFaction === playerFaction
  const isContested = zone.faction === 'contested'
  const playerFactionName = FACTION_DEFINITIONS[playerFaction].name

  // Faction-aware framing for Horde zones / contested territory.
  if (isHostile && playerFaction === 'alliance') {
    return `Drive the Ashmarch back. Slay ${zone.mobs.find(m => m.id === zone.bossId)?.name ?? 'the zone boss'} to open the path forward.`
  }
  if (isHostile && playerFaction === 'horde') {
    return `Reclaim these lands for the Ashmarch. Slay ${zone.mobs.find(m => m.id === zone.bossId)?.name ?? 'the zone boss'} to secure the next front.`
  }
  if (isContested) {
    return `${playerFactionName} claims no ground here. Slay ${zone.mobs.find(m => m.id === zone.bossId)?.name ?? 'the zone boss'} to force a crossing.`
  }
  return `Pacify ${zone.name}. Defeat ${zone.mobs.find(m => m.id === zone.bossId)?.name ?? 'the zone boss'} to venture onward.`
}

export function makeZoneQuest(zoneId: ZoneId, playerFaction: FactionType): ZoneQuest | null {
  const zone = ZONES[zoneId]
  if (!zone) return null
  return {
    id: `quest:${zoneId}`,
    zoneId,
    title: questTitle(zone),
    description: questDescription(zone, playerFaction),
    levelReq: zone.levelRange[0],
    killsReq: zone.unlockKills,
    bossId: zone.bossId,
    rewardZoneId: zone.nextZone,
    completed: false,
    claimed: false,
  }
}

export function isZoneQuestComplete(
  quest: ZoneQuest,
  totalZoneKills: Record<string, number>,
  bossesDefeated: ZoneId[],
): boolean {
  const kills = totalZoneKills[quest.zoneId] ?? 0
  const bossDown = bossesDefeated.includes(quest.zoneId)
  return kills >= quest.killsReq && bossDown
}

/** Generate a fresh active quest for the player's current zone if the boss there is unbeaten. */
export function deriveActiveQuest(state: Pick<GameState, 'currentZone' | 'playerFaction' | 'bossesDefeated'>): ZoneQuest | null {
  const { currentZone, playerFaction, bossesDefeated } = state
  if (bossesDefeated.includes(currentZone)) return null
  return makeZoneQuest(currentZone, playerFaction)
}

// ── Town hostility helpers ────────────────────────────────────────────────────

export function isTownHostileToPlayer(townId: string, playerFaction: FactionType): boolean {
  const town = TOWNS[townId]
  if (!town) return false
  if (town.type !== 'hostile') return false
  if (town.faction === 'neutral') return false
  return town.faction !== playerFaction
}

export function townForZone(zoneId: ZoneId): string | undefined {
  return ZONE_TOWN[zoneId]
}
