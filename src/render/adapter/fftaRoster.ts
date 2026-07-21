// FFTA scaffold sprite selection tables.
// Generated from local-assets/ffta-scaffold/ffta-units/index.json (dev-only, gitignored).
// Each entry is a manifest id under local-assets/ffta-scaffold/ffta-units/<id>.json.
// Missing assets fall back to placeholder rigs in combatAdapter, so the repo always
// builds even when the scaffold is absent.

import type { ClassType, RaceType } from '../../data/types'

// ── Hero race/class → FFTA unit manifest ids ─────────────────────────────────
// Race mapping (Idle race → FFTA race):
//   human Hume,    elf Viera,   dwarf Nu Mou,
//   orc/troll/tauren Bangaa,     goblin/gnome Moogle.
// Each pool is race-specific where possible and falls back to Hume jobs when a class
// has no good match for that FFTA race, so every race/class combo still has sprites.
export const HERO_SPRITES: Record<RaceType, Record<ClassType, string[]>> = {
  human: {
    warrior: ['ffa_soldier', 'ffa_paladin', 'ffa_fighter', 'ffa_hunter'],
    mage:    ['ffa_white_mage', 'ffa_black_mage', 'ffa_illusionist', 'ffa_blue_mage'],
    rogue:   ['ffa_thief', 'ffa_ninja', 'ffa_archer', 'ffa_hunter'],
    warlock: ['ffa_black_mage', 'ffa_illusionist', 'ffa_blue_mage'],
  },
  dwarf: {
    warrior: ['ffa_soldier', 'ffa_paladin', 'ffa_fighter', 'ffa_hunter'],
    mage:    ['ffa_white_mage', 'ffa_black_mage', 'ffa_time_mage', 'ffa_illusionist', 'ffa_alchemist', 'ffa_sage'],
    rogue:   ['ffa_thief', 'ffa_ninja', 'ffa_archer', 'ffa_hunter'],
    warlock: ['ffa_black_mage', 'ffa_illusionist', 'ffa_alchemist', 'ffa_beastmaster', 'ffa_morpher'],
  },
  elf: {
    warrior: ['ffa_soldier', 'ffa_paladin', 'ffa_fighter', 'ffa_hunter'],
    mage:    ['ffa_elementalist', 'ffa_red_mage', 'ffa_white_mage', 'ffa_summoner'],
    rogue:   ['ffa_fencer', 'ffa_archer', 'ffa_assassin', 'ffa_sniper'],
    warlock: ['ffa_elementalist', 'ffa_summoner'],
  },
  orc: {
    warrior: ['ffa_warrior', 'ffa_dragoon', 'ffa_defender', 'ffa_gladiator', 'ffa_white_monk', 'ffa_templar'],
    mage:    ['ffa_bishop'],
    rogue:   ['ffa_thief', 'ffa_ninja', 'ffa_archer', 'ffa_hunter'],
    warlock: ['ffa_dragoon', 'ffa_bishop'],
  },
  troll: {
    warrior: ['ffa_warrior', 'ffa_dragoon', 'ffa_defender', 'ffa_gladiator', 'ffa_white_monk', 'ffa_templar'],
    mage:    ['ffa_bishop'],
    rogue:   ['ffa_thief', 'ffa_ninja', 'ffa_archer', 'ffa_hunter'],
    warlock: ['ffa_dragoon', 'ffa_bishop'],
  },
  goblin: {
    warrior: ['ffa_mog_knight'],
    mage:    ['ffa_black_mage', 'ffa_time_mage'],
    rogue:   ['ffa_gunner', 'ffa_thief', 'ffa_juggler', 'ffa_gadgeteer'],
    warlock: ['ffa_animist', 'ffa_black_mage'],
  },
  gnome: {
    warrior: ['ffa_mog_knight'],
    mage:    ['ffa_black_mage', 'ffa_time_mage'],
    rogue:   ['ffa_gunner', 'ffa_thief', 'ffa_juggler', 'ffa_gadgeteer'],
    warlock: ['ffa_animist', 'ffa_black_mage'],
  },
  tauren: {
    warrior: ['ffa_warrior', 'ffa_dragoon', 'ffa_defender', 'ffa_gladiator', 'ffa_white_monk', 'ffa_templar'],
    mage:    ['ffa_bishop'],
    rogue:   ['ffa_thief', 'ffa_ninja', 'ffa_archer', 'ffa_hunter'],
    warlock: ['ffa_dragoon', 'ffa_bishop'],
  },
}

// ── Named monster units (32×40 FFTA beast sprites) ─────────────────────────────
export const MONSTER_SPRITES = [
  'ffa_red_panther', 'ffa_icedrake', 'ffa_bomb', 'ffa_jelly', 'ffa_lamia', 'ffa_malboro',
  'ffa_floateye', 'ffa_zombie', 'ffa_vampire', 'ffa_goblin', 'ffa_antlion', 'ffa_tonberry',
  'ffa_toughskin',
] as const

export const MONSTER_SPRITE_SET = new Set<string>(MONSTER_SPRITES)

/** True if the manifest id is one of the named monster sheets (beast placeholder fallback). */
export function isMonsterSprite(id: string): boolean {
  return MONSTER_SPRITE_SET.has(id)
}

// ── Mob name → sprite pool ───────────────────────────────────────────────────
// Keywords are ordered most-specific-first.  The resolver hashes the mob name to
// pick a stable sprite from the matching pool, so "Jungle Troll" always looks the same.
type KeywordPool = [RegExp, string[]]
const MOB_KEYWORDS: KeywordPool[] = [
  // Beasts / monsters
  [/wolf|worg|worgen|panther|cat|tiger|raptor|hound/, ['ffa_red_panther']],
  [/drake|dragon|wyrm|whelp|hydra|dragonkin/, ['ffa_icedrake']],
  [/elemental|infernal|ember|flame|fire|magma|ash|lava/, ['ffa_bomb']],
  [/slime|jelly|ooze|gel|pudding|blob/, ['ffa_jelly']],
  [/snake|serpent|lamia|naga|viper|cobra/, ['ffa_lamia']],
  [/plant|flower|malboro|vine|shambler|treant|fungus|mushroom/, ['ffa_malboro']],
  [/eye|beholder|gazer|watcher|devourer|floateye/, ['ffa_floateye']],
  [/zombie|undead|ghoul|corpse|rot|skeleton|wraith|lich/, ['ffa_zombie']],
  [/vampire|bat|blood|nosferatu/, ['ffa_vampire']],
  [/goblin|kobold|imp|gremlin|sapper|sprite/, ['ffa_goblin', 'ffa_tonberry']],
  [/ant|bug|insect|spider|scorpion|beetle|mantis|antlion/, ['ffa_antlion']],
  [/lizard|tonberry|newt|gecko/, ['ffa_tonberry']],
  [/ogre|troll|brute|golem|toughskin|giant|ettin|beast/, ['ffa_toughskin']],
  [/boar|pig|hog|swine/, ['ffa_toughskin']],
  [/vulture|bird|crow|raven/, ['ffa_floateye', 'ffa_icedrake']],

  // Humanoid mobs rendered as FFTA job sprites (enemy palette tints them)
  [/orc|grunt|raider/, ['ffa_warrior', 'ffa_dragoon', 'ffa_white_monk']],
  [/bandit|thug|deserter|mercenary|marauder|outlaw|brigand|pirate/, ['ffa_thief', 'ffa_ninja', 'ffa_fighter', 'ffa_soldier']],
  [/soldier|warrior|knight|champion|blademaster|warlord/, ['ffa_soldier', 'ffa_fighter', 'ffa_paladin', 'ffa_warrior']],
  [/shaman|priest|seer|oracle|witch[- ]?doctor|warlock|mage|magus|sorcerer|conjurer/, ['ffa_black_mage', 'ffa_white_mage', 'ffa_bishop', 'ffa_illusionist']],
  [/monk|pugilist/, ['ffa_white_monk', 'ffa_fighter']],
]

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Pick a sprite for a mob by name. Falls back to a random named monster if no keyword matches. */
export function resolveMobSprite(name: string): string {
  const n = name.toLowerCase()
  for (const [re, pool] of MOB_KEYWORDS) {
    if (re.test(n)) return pool[strHash(n) % pool.length]
  }
  return MONSTER_SPRITES[strHash(n) % MONSTER_SPRITES.length]
}

/** Pick a hero sprite from a race/class pool, deterministically keyed by unit name. */
export function heroSpriteId(
  race: RaceType,
  cls: ClassType,
  name: string,
): string {
  const pool = HERO_SPRITES[race]?.[cls] ?? HERO_SPRITES.human[cls]
  return pool[strHash(name) % pool.length] ?? pool[0]
}
