import type { TownConfig, TownId, ZoneId } from './types'

// ── Town definitions ──────────────────────────────────────────────────────────

export const TOWNS: Record<TownId, TownConfig> = {
  sunhollow_village: {
    id: 'sunhollow_village',
    name: 'Sunhollow Village',
    faction: 'alliance',
    type: 'friendly',
    services: ['rest', 'vendor'],
    linkedZone: 'sunhollow_meadows',
    description: 'A farming village under constant threat from the wilds.',
  },
  dustwind_post: {
    id: 'dustwind_post',
    name: 'Dustwind Post',
    faction: 'alliance',
    type: 'friendly',
    services: ['rest', 'vendor', 'repair'],
    linkedZone: 'dustwind_plains',
    description: 'A fortified outpost holding the line against bandit raids.',
  },
  grimshade_refuge: {
    id: 'grimshade_refuge',
    name: 'Grimshade Refuge',
    faction: 'alliance',
    type: 'friendly',
    services: ['rest', 'vendor'],
    linkedZone: 'grimshade_forest',
    description: 'Survivors who refused to flee the cursed wood.',
  },
  crossroads_market: {
    id: 'crossroads_market',
    name: 'The Crossroads Market',
    faction: 'neutral',
    type: 'neutral',
    services: ['vendor'],
    linkedZone: 'shattered_crossing',
    description: 'War-profiteers and displaced traders selling to anyone with gold.',
  },
  ironcrag_hold: {
    id: 'ironcrag_hold',
    name: 'Ironcrag Hold',
    faction: 'horde',
    type: 'hostile',
    services: ['vendor'],
    linkedZone: 'ironcrag_badlands',
    description: 'The seat of the first Ashmarch clan. No mercy for outsiders.',
  },
  warsong_bastion: {
    id: 'warsong_bastion',
    name: 'Wardrum Bastion',
    faction: 'horde',
    type: 'hostile',
    services: ['vendor', 'repair'],
    linkedZone: 'warsong_mesa',
    description: 'The war-drum never stops. Neither do the patrols.',
  },
}

// ── Zone → Town mapping ───────────────────────────────────────────────────────

export const ZONE_TOWN: Partial<Record<ZoneId, TownId>> = {
  sunhollow_meadows: 'sunhollow_village',
  dustwind_plains:   'dustwind_post',
  grimshade_forest:  'grimshade_refuge',
  shattered_crossing:'crossroads_market',
  ironcrag_badlands: 'ironcrag_hold',
  warsong_mesa:      'warsong_bastion',
}
