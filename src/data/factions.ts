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
    name: 'The Alliance',
    color: '#4a90d9',
    opposingFaction: 'horde',
    description: 'A coalition of humans, dwarves, and elves bound by honour and ancient oaths.',
    motto: 'For the Alliance.',
  },

  horde: {
    id: 'horde',
    name: 'The Horde',
    color: '#c0392b',
    opposingFaction: 'alliance',
    description: 'Orcs, trolls, and goblins united by strength, survival, and the will to dominate.',
    motto: 'Lok\'tar Ogar.',
  },

  neutral: {
    id: 'neutral',
    name: 'Neutral',
    color: '#b8a070',
    opposingFaction: null,
    description: 'Those who walk between factions — gnomes and tauren who answer to no banner.',
    motto: 'Gold has no allegiance.',
  },
}
