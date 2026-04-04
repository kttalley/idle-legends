import type { MobInstance, Item, Slot } from '../data/types'
import { generateItem } from '../data/items'
import { ITEM_DROP_CHANCE, GOLD_DROP_VARIANCE } from '../data/constants'

export interface LootResult {
  gold: number
  item: Item | null
}

const ALL_SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

export function rollLoot(mob: MobInstance, level: number, goldFindBonus: number): LootResult {
  // Gold
  const base = mob.goldMin + Math.random() * (mob.goldMax - mob.goldMin)
  const variance = 1 + (Math.random() * 2 - 1) * GOLD_DROP_VARIANCE
  const gold = Math.max(1, Math.round(base * variance * goldFindBonus))

  // Item
  let item: Item | null = null
  const dropChance = mob.isElite ? ITEM_DROP_CHANCE * 2 : mob.isBoss ? 1.0 : ITEM_DROP_CHANCE
  if (Math.random() < dropChance) {
    const rarityBias = mob.isBoss ? 3 : mob.isElite ? 1.5 : 0
    const slot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)]
    item = generateItem(slot, level, rarityBias)
  }

  return { gold, item }
}
