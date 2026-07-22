import type { ClassDefinition } from './types'
import { ARMS_TALENTS } from './talents/arms'
import { FROST_TALENTS } from './talents/frost'
import { ASSASSINATION_TALENTS } from './talents/assassination'
import { AFFLICTION_TALENTS } from './talents/affliction'

export const CLASS_DEFINITIONS: Record<string, ClassDefinition> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    description: 'A plate-armored bruiser. Steady damage, high health, built to endure. Ironcleave spec: cleave and shatter.',
    primaryStat: 'strength',
    colorClass: 'class-warrior',
    allowedRaces: ['human', 'dwarf', 'elf', 'orc', 'troll', 'tauren'],
    baseStats: {
      strength: 20,
      intellect: 5,
      agility: 10,
      stamina: 25,
      armor: 30,
      weaponDps: 8,
      attackSpeedSeconds: 2.5,
      goldFindBonus: 1.0,
    },
    talents: ARMS_TALENTS,
  },

  mage: {
    id: 'mage',
    name: 'Mage',
    description: 'An arcane glass cannon. Glacial Rite spec: freeze, shatter, and Deepening Cold stacks.',
    primaryStat: 'intellect',
    colorClass: 'class-mage',
    allowedRaces: ['human', 'elf', 'gnome', 'troll', 'goblin'],
    baseStats: {
      strength: 5,
      intellect: 25,
      agility: 8,
      stamina: 10,
      armor: 5,
      weaponDps: 6,
      attackSpeedSeconds: 1.8,
      goldFindBonus: 1.0,
    },
    talents: FROST_TALENTS,
  },

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    description: 'Shadow daggers and lethal precision. Shadowed Edge spec: poisons, combo points, Dead Calm.',
    primaryStat: 'agility',
    colorClass: 'class-rogue',
    allowedRaces: ['human', 'dwarf', 'elf', 'gnome', 'orc', 'troll', 'goblin'],
    baseStats: {
      strength: 10,
      intellect: 8,
      agility: 22,
      stamina: 12,
      armor: 12,
      weaponDps: 7,
      attackSpeedSeconds: 1.5,
      goldFindBonus: 1.15,
    },
    talents: ASSASSINATION_TALENTS,
  },

  warlock: {
    id: 'warlock',
    name: 'Warlock',
    description: 'Shadow curses and void corruption. Bleakweave spec: DoTs, Gathering Dark procs, Tithe of Wounds.',
    primaryStat: 'intellect',
    colorClass: 'class-warlock',
    allowedRaces: ['human', 'gnome', 'orc', 'goblin', 'troll'],
    baseStats: {
      strength: 6,
      intellect: 22,
      agility: 7,
      stamina: 15,
      armor: 8,
      weaponDps: 5,
      attackSpeedSeconds: 2.2,
      goldFindBonus: 1.0,
    },
    talents: AFFLICTION_TALENTS,
  },
}
