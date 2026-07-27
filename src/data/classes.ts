import type { ClassDefinition, ClassType, SpecDefinition } from './types'
import { IRONCLEAVE_TALENTS, IRONCLEAVE_CONNECTORS } from './talents/warrior/ironcleave'
import { BULWARK_TALENTS, BULWARK_CONNECTORS } from './talents/warrior/bulwark'
import { WARBRINGER_TALENTS, WARBRINGER_CONNECTORS } from './talents/warrior/warbringer'
import { FROST_TALENTS } from './talents/frost'
import { ASSASSINATION_TALENTS } from './talents/assassination'
import { AFFLICTION_TALENTS } from './talents/affliction'

/**
 * A spec whose tree has not been authored yet.
 *
 * The alternative was to ship classes with one tree and pretend that was the design,
 * which is exactly the dead end this rework exists to fix. An empty column that SAYS it
 * is empty tells the player the truth about where their class stands; a missing column
 * tells them their class is finished. Warrior is complete — see below — and these fill
 * the same shape until the rest catch up.
 */
function pending(
  classId: ClassType, id: string, name: string, tagline: string, icon: string, accent: string,
): SpecDefinition {
  return {
    id, classId, name, tagline, icon, accent,
    description: 'This specialization is still being forged. Its talents are not yet available.',
    talents: [],
  }
}

export const CLASS_DEFINITIONS: Record<string, ClassDefinition> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    description: 'A plate-armored bruiser. Steady damage, high health, built to endure — and the only class whose three paths are fully forged.',
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
    specs: [
      {
        id: 'ironcleave',
        classId: 'warrior',
        name: 'Ironcleave',
        tagline: 'One weapon, held in both hands, swung until it is over.',
        description: 'Damage per swing over swings per second. Bleeds that outlive the blow that opened them, crits that land like a verdict, and a finisher for anything that made it this far.',
        icon: 'cleave',
        accent: '#c8a118',
        talents: IRONCLEAVE_TALENTS,
        connectors: IRONCLEAVE_CONNECTORS,
      },
      {
        id: 'bulwark',
        classId: 'warrior',
        name: 'Bulwark',
        tagline: 'The fight you never lose is the one you never have to walk back to.',
        description: 'Armor, block and refusal. Nothing here makes you hit harder — it makes you stop stopping, and an unattended hero who never dies out-earns one who hits harder and does.',
        icon: 'guard',
        accent: '#6a8fc8',
        talents: BULWARK_TALENTS,
        connectors: BULWARK_CONNECTORS,
      },
      {
        id: 'warbringer',
        classId: 'warrior',
        name: 'Warbringer',
        tagline: 'Two weapons, no shield, no patience.',
        description: 'Swings per second over damage per swing. Every talent compounds off swing count, and the only healing is the blood you take back out of what you hit.',
        icon: 'fury',
        accent: '#c8503a',
        talents: WARBRINGER_TALENTS,
        connectors: WARBRINGER_CONNECTORS,
      },
    ],
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
    specs: [
      {
        id: 'glacial_rite',
        classId: 'mage',
        name: 'Glacial Rite',
        tagline: 'Hold it still long enough and it stops being a fight.',
        description: 'Freeze, shatter, and Deepening Cold stacks. An enemy that cannot swing is an enemy that cannot win.',
        icon: 'freeze',
        accent: '#6ac8d8',
        talents: FROST_TALENTS,
      },
      pending('mage', 'emberwright', 'Emberwright', 'Everything burns twice — once now, once after.', 'nova', '#e08040'),
      pending('mage', 'the_unwritten', 'The Unwritten', 'Arcane debt, called in all at once.', 'hourglass', '#a878d8'),
    ],
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
    specs: [
      {
        id: 'shadowed_edge',
        classId: 'rogue',
        name: 'Shadowed Edge',
        tagline: 'The wound is not the point. What is on the blade is the point.',
        description: 'Poisons, combo points and Dead Calm. Damage that has already happened by the time it is noticed.',
        icon: 'vial',
        accent: '#7ac878',
        talents: ASSASSINATION_TALENTS,
      },
      pending('rogue', 'gutterwork', 'Gutterwork', 'Fast hands, cheap tricks, no witnesses.', 'dagger', '#c8a118'),
      pending('rogue', 'the_long_quiet', 'The Long Quiet', 'One strike from somewhere you were not.', 'stride', '#8878c8'),
    ],
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
    specs: [
      {
        id: 'bleakweave',
        classId: 'warlock',
        name: 'Bleakweave',
        tagline: 'Nothing you do is fast. Everything you do is already happening.',
        description: 'DoTs, Gathering Dark procs and the Tithe of Wounds. You do not kill things so much as finish paperwork on them.',
        icon: 'skull',
        accent: '#9a6ac8',
        talents: AFFLICTION_TALENTS,
      },
      pending('warlock', 'the_binding', 'The Binding', 'Something else does the dying for you.', 'pact', '#c85a7a'),
      pending('warlock', 'cinderpact', 'Cinderpact', 'Borrowed fire, ruinous interest.', 'nova', '#e06840'),
    ],
  },
}
