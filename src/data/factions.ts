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
