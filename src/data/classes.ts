import type { ClassDefinition } from './types'
import { IRONCLEAVE_TALENTS, IRONCLEAVE_CONNECTORS } from './talents/warrior/ironcleave'
import { BULWARK_TALENTS, BULWARK_CONNECTORS } from './talents/warrior/bulwark'
import { WARBRINGER_TALENTS, WARBRINGER_CONNECTORS } from './talents/warrior/warbringer'
import { GLACIAL_RITE_TALENTS, GLACIAL_RITE_CONNECTORS } from './talents/mage/glacial_rite'
import { EMBERWRIGHT_TALENTS, EMBERWRIGHT_CONNECTORS } from './talents/mage/emberwright'
import { THE_UNWRITTEN_TALENTS, THE_UNWRITTEN_CONNECTORS } from './talents/mage/the_unwritten'
import { SHADOWED_EDGE_TALENTS, SHADOWED_EDGE_CONNECTORS } from './talents/rogue/shadowed_edge'
import { GUTTERWORK_TALENTS, GUTTERWORK_CONNECTORS } from './talents/rogue/gutterwork'
import { THE_LONG_QUIET_TALENTS, THE_LONG_QUIET_CONNECTORS } from './talents/rogue/the_long_quiet'
import { BLEAKWEAVE_TALENTS, BLEAKWEAVE_CONNECTORS } from './talents/warlock/bleakweave'
import { THE_BINDING_TALENTS, THE_BINDING_CONNECTORS } from './talents/warlock/the_binding'
import { CINDERPACT_TALENTS, CINDERPACT_CONNECTORS } from './talents/warlock/cinderpact'

// Twelve trees, three per class, 60 ranks each — 180 places to put a lifetime budget of
// 100 points (see TALENT_POINT_MAX). Every spec's `accent` is load-bearing rather than
// decorative: it drives that column's whole visual identity in the talent panel, and
// three trees rendered in one colour read as one tree.

export const CLASS_DEFINITIONS: Record<string, ClassDefinition> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    description: 'A plate-armored bruiser. Steady damage, high health. Swing one huge weapon, refuse to fall, or carry two and no shield.',
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
    description: 'An arcane glass cannon. Hold it still, set it alight, or make the hour pay twice.',
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
        talents: GLACIAL_RITE_TALENTS,
        connectors: GLACIAL_RITE_CONNECTORS,
      },
      {
        id: 'emberwright',
        classId: 'mage',
        name: 'Emberwright',
        tagline: 'Everything burns twice — once now, once after.',
        description: 'Crits light the target, a burning target is easier to crit, and every flame you own bites deeper. Invest in one corner and the other two improve on their own.',
        icon: 'nova',
        accent: '#e08040',
        talents: EMBERWRIGHT_TALENTS,
        connectors: EMBERWRIGHT_CONNECTORS,
      },
      {
        id: 'the_unwritten',
        classId: 'mage',
        name: 'The Unwritten',
        tagline: 'Arcane debt, called in all at once.',
        description: 'Charges bank while you keep the pressure on one target and vanish when it dies. The only build in the game that would rather fight one large thing than five small ones.',
        icon: 'hourglass',
        accent: '#a878d8',
        talents: THE_UNWRITTEN_TALENTS,
        connectors: THE_UNWRITTEN_CONNECTORS,
      },
    ],
  },

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    description: 'Shadow daggers and lethal precision. Coat the blade and wait, fight dirty and fast, or strike once from somewhere you were not.',
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
        talents: SHADOWED_EDGE_TALENTS,
        connectors: SHADOWED_EDGE_CONNECTORS,
      },
      {
        id: 'gutterwork',
        classId: 'rogue',
        name: 'Gutterwork',
        tagline: 'Fast hands, cheap tricks, no witnesses.',
        description: 'No poison, no patience, no plan beyond the next four seconds. The most dice rolls per minute of any build, and the least interest in what any one of them does.',
        icon: 'dagger',
        accent: '#c8a118',
        talents: GUTTERWORK_TALENTS,
        connectors: GUTTERWORK_CONNECTORS,
      },
      {
        id: 'the_long_quiet',
        classId: 'rogue',
        name: 'The Long Quiet',
        tagline: 'One strike from somewhere you were not.',
        description: 'Built entirely around the opening blow. It wants short fights and fast kills, because a new target is a new opener — and a long grind against one enemy is the thing it has no answer to.',
        icon: 'stride',
        accent: '#8878c8',
        talents: THE_LONG_QUIET_TALENTS,
        connectors: THE_LONG_QUIET_CONNECTORS,
      },
    ],
  },

  warlock: {
    id: 'warlock',
    name: 'Warlock',
    description: 'Shadow curses and void corruption. Rot it slowly, bind something to do it for you, or simply spend.',
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
        talents: BLEAKWEAVE_TALENTS,
        connectors: BLEAKWEAVE_CONNECTORS,
      },
      {
        id: 'the_binding',
        classId: 'warlock',
        name: 'The Binding',
        tagline: 'Something else does the dying for you.',
        description: 'A bound thing attacks on its own clock — through a cast, through a stun, through the player closing the tab. The most purely idle build in the game, and the one with the least ceiling when somebody is watching.',
        icon: 'pact',
        accent: '#c85a7a',
        talents: THE_BINDING_TALENTS,
        connectors: THE_BINDING_CONNECTORS,
      },
      {
        id: 'cinderpact',
        classId: 'warlock',
        name: 'Cinderpact',
        tagline: 'Borrowed fire, ruinous interest.',
        description: 'Direct, immediate and expensive: the whole tree exists to make one number go up. The most fragile spec in the game, whose only sustain is that things tend to already be dead.',
        icon: 'nova',
        accent: '#e06840',
        talents: CINDERPACT_TALENTS,
        connectors: CINDERPACT_CONNECTORS,
      },
    ],
  },
}
