import type { Item, Rarity, Slot, StatBonuses } from './types'
import { RARITY_WEIGHTS } from './constants'

// ── Stat templates by slot ────────────────────────────────────────────────────
type StatKey = keyof StatBonuses

const SLOT_STATS: Record<Slot, StatKey[]> = {
  weapon:  ['weaponDps', 'strength', 'agility', 'intellect', 'critChance'],
  helm:    ['stamina', 'intellect', 'strength', 'armor'],
  chest:   ['stamina', 'armor', 'strength', 'agility'],
  legs:    ['stamina', 'armor', 'agility', 'strength'],
  boots:   ['agility', 'stamina', 'armor'],
  trinket: ['critChance', 'goldFindBonus', 'stamina', 'weaponDps', 'intellect'],
}

const RARITY_STAT_MULTIPLIER: Record<Rarity, number> = {
  common:    1.0,
  uncommon:  1.5,
  rare:      2.2,
  epic:      3.5,
  legendary: 6.0,
}

const RARITY_STAT_COUNT: Record<Rarity, number> = {
  common:    1,
  uncommon:  2,
  rare:      3,
  epic:      4,
  legendary: 5,
}

/**
 * Rough power ranking, used for "is this an upgrade" decisions.
 *
 * Deliberately derived from the same two inputs `generateItem` rolls stats from — item
 * level sets the stat base and rarity sets both the multiplier and how many stats roll —
 * so it is monotonic in exactly the things that make an item better. `vendorValue` would
 * almost work, but it carries a ±20% random factor and would make the same comparison
 * come out differently for identical items.
 */
export function itemPower(item: Item): number {
  return item.level * RARITY_STAT_MULTIPLIER[item.rarity] * RARITY_STAT_COUNT[item.rarity]
}

// ── Procedural item name parts ────────────────────────────────────────────────
const PREFIX: Record<Rarity, string[]> = {
  common:    ['Worn', 'Scavenged', 'Crude', 'Battered'],
  uncommon:  ['Sturdy', 'Reinforced', 'Keen', 'Polished'],
  rare:      ['Gleaming', 'Enchanted', 'Shadowforged', 'Ironveil'],
  epic:      ['Soulbound', 'Dreadwrought', 'Voidtouched', 'Blazing'],
  legendary: ['Ancient', 'Mythic', 'Godforged', 'Eternal'],
}

/**
 * How a physical blow LANDS — the difference between a cut, a crush and a puncture.
 *
 * Read by the renderer to pick an impact, so a mace and a dagger stop producing the same
 * spray of sparks. Derived from the weapon's NAME rather than a new field on `Item`,
 * because the name is the only thing that already distinguishes them and it is generated
 * from `SLOT_NAMES.weapon` below — a field would have to be backfilled onto every drop in
 * every existing save, and set correctly on all twelve authored uniques, to say something
 * the word "Dagger" already says.
 *
 * The class fallback is what makes that safe: an unrecognised or missing weapon still gets
 * the blow its class would throw bare-handed, so a name this table has never seen degrades
 * to plausible rather than to nothing.
 */
export type HitStyle = 'slash' | 'blunt' | 'pierce'

const HIT_STYLE_WORDS: [RegExp, HitStyle][] = [
  [/dagger|dirk|stiletto|fang|tusk|pick|spike|needle|talon|claw|shiv/i, 'pierce'],
  [/mace|hammer|maul|club|cudgel|staff|stave|bludgeon|crusher|stomper/i, 'blunt'],
  [/sword|axe|blade|sabre|saber|scythe|cleaver|edge|glaive|falchion/i, 'slash'],
]

const CLASS_HIT_STYLE: Record<string, HitStyle> = {
  warrior: 'slash', rogue: 'pierce', mage: 'blunt', warlock: 'blunt',
}

export function hitStyleOf(weaponName: string | undefined, playerClass: string): HitStyle {
  if (weaponName) {
    for (const [re, style] of HIT_STYLE_WORDS) if (re.test(weaponName)) return style
  }
  return CLASS_HIT_STYLE[playerClass] ?? 'slash'
}

const SLOT_NAMES: Record<Slot, string[]> = {
  weapon:  ['Sword', 'Axe', 'Staff', 'Dagger', 'Mace', 'Blade'],
  helm:    ['Helm', 'Cap', 'Crown', 'Hood', 'Coif'],
  chest:   ['Chestplate', 'Tunic', 'Breastplate', 'Vest', 'Hauberk'],
  legs:    ['Leggings', 'Greaves', 'Trousers', 'Legplates'],
  boots:   ['Boots', 'Sabatons', 'Treads', 'Stompers'],
  trinket: ['Trinket', 'Amulet', 'Sigil', 'Charm', 'Talisman'],
}

// ── Weighted rarity roll ──────────────────────────────────────────────────────
export function rollRarity(bias: number = 0): Rarity {
  const weights: Record<Rarity, number> = { ...RARITY_WEIGHTS }
  // bias > 0 shifts weight toward rarer items (boss/elite loot)
  if (bias > 0) {
    weights.common    = Math.max(50,  weights.common    - bias * 60)
    weights.uncommon  = Math.max(100, weights.uncommon  + bias * 20)
    weights.rare      = Math.min(300, weights.rare      + bias * 40)
    weights.epic      = Math.min(150, weights.epic      + bias * 30)
    weights.legendary = Math.min(80,  weights.legendary + bias * 20)
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let roll = Math.random() * total
  for (const [rarity, weight] of Object.entries(weights) as [Rarity, number][]) {
    roll -= weight
    if (roll <= 0) return rarity
  }
  return 'common'
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Item Generator ────────────────────────────────────────────────────────────
export function generateItem(
  slot: Slot,
  level: number,
  rarityBias: number = 0,
  /** Skip the random roll and mint at this exact rarity. Crafting uses it so an item's
   *  quality is *earned* by the material that went in, not gambled for. */
  forceRarity?: Rarity,
  /** Override the generated name (crafted goods carry their recipe's name). */
  nameOverride?: string,
): Item {
  const rarity = forceRarity ?? rollRarity(rarityBias)
  const mult   = RARITY_STAT_MULTIPLIER[rarity]
  const count  = RARITY_STAT_COUNT[rarity]
  const statPool = shuffle(SLOT_STATS[slot]).slice(0, count)

  const statBonuses: StatBonuses = {}
  for (const stat of statPool) {
    const base = level * 0.5 + 1
    if (stat === 'weaponDps') {
      statBonuses.weaponDps = Math.round(randFloat(base * 0.8, base * 1.3) * mult)
    } else if (stat === 'armor') {
      statBonuses.armor = Math.round(randFloat(base * 1.0, base * 1.6) * mult)
    } else if (stat === 'critChance') {
      statBonuses.critChance = parseFloat((randFloat(0.01, 0.03) * mult).toFixed(3))
    } else if (stat === 'goldFindBonus') {
      statBonuses.goldFindBonus = parseFloat((1 + randFloat(0.05, 0.15) * mult).toFixed(2))
    } else if (stat === 'attackSpeedSeconds') {
      statBonuses.attackSpeedSeconds = parseFloat((-randFloat(0.05, 0.2) * mult).toFixed(2))
    } else {
      statBonuses[stat] = Math.round(randFloat(base * 0.6, base * 1.0) * mult)
    }
  }

  const prefix = PREFIX[rarity][randInt(0, PREFIX[rarity].length - 1)]
  const base   = SLOT_NAMES[slot][randInt(0, SLOT_NAMES[slot].length - 1)]
  const name   = nameOverride ?? `${prefix} ${base}`

  const vendorValue = Math.round(
    level * ({ common: 1, uncommon: 3, rare: 8, epic: 25, legendary: 100 }[rarity]) *
    randFloat(0.8, 1.2)
  )

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    slot,
    rarity,
    level,
    statBonuses,
    vendorValue,
    spriteKey: `item_${slot}`,
  }
}

// ── Loot table drops ──────────────────────────────────────────────────────────
// Named drops from mob loot tables — simple static items with fixed stats
const NAMED_ITEMS: Record<string, Partial<Item>> = {
  wolf_pelt:        { name: 'Wolf Pelt',         slot: 'chest', rarity: 'common',   level: 1 },
  tattered_collar:  { name: 'Tattered Collar',   slot: 'trinket', rarity: 'common', level: 1 },
  miners_pick:      { name: "Miner's Pick",       slot: 'weapon', rarity: 'common',  level: 2 },
  rough_cloth:      { name: 'Rough Cloth Helm',   slot: 'helm',   rarity: 'common',  level: 2 },
  boar_tusk:        { name: 'Boar Tusk Dagger',   slot: 'weapon', rarity: 'uncommon', level: 3 },
  coarse_hide:      { name: 'Coarse Hide Vest',   slot: 'chest',  rarity: 'common',  level: 3 },
  ancient_fang:     { name: 'Ancient Fang',       slot: 'trinket', rarity: 'rare',   level: 8 },
  beast_hide_chest: { name: 'Beast-hide Chest',   slot: 'chest',  rarity: 'uncommon', level: 8 },
}

export function getNamedItemDrop(tableId: string, level: number): Item | null {
  const template = NAMED_ITEMS[tableId]
  if (!template) return generateItem(
    ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket'][
      Math.floor(Math.random() * 6)
    ] as Slot,
    level,
    0
  )
  return generateItem(template.slot ?? 'trinket', template.level ?? level, 0)
}
