import type { RaceDefinition, RaceType } from './types'

export const RACE_DEFINITIONS: Record<RaceType, RaceDefinition> = {
  // ── Alliance ──────────────────────────────────────────────────────────────
  human: {
    id: 'human',
    name: 'Human',
    faction: 'alliance',
    allowedClasses: ['warrior', 'mage', 'rogue', 'warlock'],
    racialPassive: { stamina: 3, goldFindBonus: 0.1 },
    racialPassiveLabel: '+3 Stamina, +10% Gold',
    description: 'Adaptable and ambitious. Humans are born diplomats and warriors alike.',
    lore: 'The most versatile of races — no door is closed to them.',
  },

  dwarf: {
    id: 'dwarf',
    name: 'Dwarf',
    faction: 'alliance',
    allowedClasses: ['warrior', 'rogue'],
    racialPassive: { armor: 8, stamina: 4 },
    racialPassiveLabel: '+8 Armor, +4 Stamina',
    description: 'Stout and unyielding. Dwarves shrug off blows that would fell lesser warriors.',
    lore: 'Their bones are hewn from the same stone as their holds.',
  },

  elf: {
    id: 'elf',
    name: 'Elf',
    faction: 'alliance',
    allowedClasses: ['warrior', 'mage', 'rogue'],
    racialPassive: { agility: 4, critChance: 0.02 },
    racialPassiveLabel: '+4 Agility, +2% Crit',
    description: 'Graceful and swift. Elves strike with precision that borders on the supernatural.',
    lore: 'They do not miss. They simply choose when to hit.',
  },

  // ── Horde ─────────────────────────────────────────────────────────────────
  orc: {
    id: 'orc',
    name: 'Orc',
    faction: 'horde',
    allowedClasses: ['warrior', 'rogue', 'warlock'],
    racialPassive: { strength: 4, weaponDps: 1.5 },
    racialPassiveLabel: '+4 Strength, +1.5 Weapon DPS',
    description: 'Ferocious and relentless. Orcs channel pure aggression into devastating strikes.',
    lore: 'The fury in an orc\'s blood is not rage — it is purpose.',
  },

  troll: {
    id: 'troll',
    name: 'Troll',
    faction: 'horde',
    allowedClasses: ['warrior', 'mage', 'rogue', 'warlock'],
    racialPassive: { attackSpeedSeconds: -0.2, agility: 2 },
    racialPassiveLabel: '-0.2s Attack Speed, +2 Agility',
    description: 'Wiry and explosive. Trolls regenerate fast and strike faster.',
    lore: 'The jungle taught them one lesson: hesitation is death.',
  },

  goblin: {
    id: 'goblin',
    name: 'Goblin',
    faction: 'horde',
    allowedClasses: ['mage', 'rogue', 'warlock'],
    racialPassive: { goldFindBonus: 0.25, intellect: 3 },
    racialPassiveLabel: '+25% Gold Find, +3 Intellect',
    description: 'Cunning and cash-hungry. Goblins find profit even in a corpse.',
    lore: 'Every battle is a market — they just know how to work the margins.',
  },

  // ── Neutral ───────────────────────────────────────────────────────────────
  gnome: {
    id: 'gnome',
    name: 'Gnome',
    faction: 'neutral',
    allowedClasses: ['mage', 'rogue', 'warlock'],
    racialPassive: { intellect: 4, agility: 2 },
    racialPassiveLabel: '+4 Intellect, +2 Agility',
    description: 'Brilliant and deceptively dangerous. Gnomes out-think every problem — including you.',
    lore: 'The smallest races carry the largest minds.',
  },

  tauren: {
    id: 'tauren',
    name: 'Tauren',
    faction: 'neutral',
    allowedClasses: ['warrior'],
    racialPassive: { stamina: 6, armor: 5 },
    racialPassiveLabel: '+6 Stamina, +5 Armor',
    description: 'Ancient and immovable. Tauren are living fortresses — slow to anger, impossible to stop.',
    lore: 'The earth moves for them. Not the other way around.',
  },
}

export const FACTION_RACES: Record<string, RaceType[]> = {
  alliance: ['human', 'dwarf', 'elf'],
  horde:    ['orc', 'troll', 'goblin'],
  neutral:  ['gnome', 'tauren'],
}
