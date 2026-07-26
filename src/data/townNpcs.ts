// ── Town NPCs ─────────────────────────────────────────────────────────────────
//
// Town used to be one panel listing every service at once, permanently covering the
// scene the town-hub renderer exists to show. Now each service belongs to somebody
// standing somewhere: you walk up to them, and only their business opens.
//
// That is worth the extra step for three reasons. The town stays visible, which is the
// whole point of having drawn one. Each menu is small enough to read instead of being one
// section of a wall of controls. And it gives the services a face — the plan's Track T5
// asked for exactly this ("give the vendor, banker and trainer bodies at anchors").
//
// Positions are RAW town tile coords, centred on the hero's arrival point at (0,0), and
// they reuse the anchors the hub scene already labelled as buildings.

import type { ClassType, FactionType, RaceType } from './types'

/** What a given NPC is there to do. One service each — that is the point. */
export type TownServiceKind = 'rest' | 'outfitter' | 'factor' | 'quartermaster'

export interface TownNpcDef {
  id: TownServiceKind
  /** Their trade, shown on the world label and as the panel heading. */
  role: string
  /** Given name, shown under the role once you are close enough to talk. */
  name: string
  /** One line of character, shown at the top of their panel. */
  greeting: string
  /** Town tile position. */
  tx: number
  ty: number
  /** Look, in the same terms the ambient crowd uses. */
  race: RaceType
  cls: ClassType
  faction: FactionType
}

/**
 * How close the hero must be before an NPC will talk. Generous enough that walking
 * roughly at someone works, tight enough that two neighbours never both open.
 */
export const NPC_TALK_RADIUS = 1.9

export const TOWN_NPCS: TownNpcDef[] = [
  {
    id: 'rest',
    role: 'Innkeeper',
    name: 'Hesta',
    greeting: 'Bed’s warm and the door bolts. Sit a while.',
    tx: -3, ty: 3.5,
    race: 'human', cls: 'warrior', faction: 'alliance',
  },
  {
    id: 'outfitter',
    role: 'Outfitter',
    name: 'Bren Halloway',
    greeting: 'Carry more, come back less. That’s the whole trade.',
    tx: -4, ty: -2.5,
    race: 'dwarf', cls: 'warrior', faction: 'alliance',
  },
  {
    id: 'factor',
    role: 'Factor',
    name: 'Ilvane Sorr',
    greeting: 'You fight. I’ll handle what falls out of it.',
    tx: 3.5, ty: -3,
    race: 'elf', cls: 'rogue', faction: 'neutral',
  },
  {
    id: 'quartermaster',
    role: 'Quartermaster',
    name: 'Odger Vale',
    greeting: 'Standing arrangements. Nothing you’ll carry, everything you’ll feel.',
    tx: 4, ty: 2.5,
    race: 'gnome', cls: 'mage', faction: 'neutral',
  },
]

export const TOWN_NPC_BY_ID: Record<TownServiceKind, TownNpcDef> =
  Object.fromEntries(TOWN_NPCS.map(n => [n.id, n])) as Record<TownServiceKind, TownNpcDef>
