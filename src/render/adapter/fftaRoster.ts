// Sprite selection tables.
//
// The `ffa_*` ids below are the STABLE ROSTER KEYS — they are how the resolver, the
// entity cache and the animator refer to a unit, and they long predate the original art.
// They are not an art source. Art is resolved from a roster key at load time:
//
//   DEFAULT (and the only thing that can ever ship) — the original Stillmarch rigs in
//   public/sprites/units/, via the ORIGINAL_SPRITE table below.
//
//   `?ffta`, DEV ONLY — the extracted FFTA scaffold under local-assets/ (gitignored,
//   never copied into dist/). A local-only dev scaffold for evaluating animation and
//   perspective; see the placeholder-art policy in PLAN.md.
//
// Flipped 2026-08-01 for store submission. Previously the scaffold was the default and
// the originals hid behind `?noffta` — which no packaged native build could ever set,
// so the shipping app rendered programmatic placeholder blobs and a town with no ground.
// Renaming the `ffa_*` keys is deliberately NOT part of this change: they are load-
// bearing cache keys, and churning them risks the renderer for zero user-visible gain.

import type { ClassType, RaceType } from '../../data/types'

/**
 * True when the caller should load the FFTA dev scaffold instead of the original rigs.
 *
 * Two independent locks, because shipping scaffold pixels is an IP incident and a URL
 * flag is not a safe sole guard on its own: the build must be DEV, *and* `?ffta` must
 * be present.
 *
 * Deliberately a `const`, not a function. `import.meta.env.DEV` is substituted with the
 * literal `false` in a production build, so `false && …` folds at compile time and the
 * bundler strips every scaffold branch AND the `local-assets/…` URL strings with it — a
 * release bundle ends up with no code path, and no path *string*, that could request a
 * scaffold asset. A function call is opaque to the minifier and left the strings behind.
 *
 * Evaluated once at module load, which is also when the loaders read it.
 * The `typeof location` guard is for the headless sim runners (tools/sim/*), which
 * execute this module under esbuild with no DOM.
 */
export const useScaffoldArt: boolean =
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('ffta')

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

// ── Roster key → original rig (the DEFAULT art path) ──────────────────────────
// Every roster key resolves through here to an original Stillmarch rig in
// public/sprites/units/ — the zero-FFTA-pixel set (docs/art-direction.md). Multiple
// roster keys collapse to one original archetype by design; variety comes from
// race/gear/rarity palette swaps rather than from distinct sheets.
// INVARIANT: every value here must exist as public/sprites/units/<value>.json, or that
// unit silently degrades to a programmatic placeholder. All 18 verified present.
export const ORIGINAL_SPRITE: Record<string, string> = {
  // Hero jobs → 5 humanoid archetypes
  ffa_soldier: 'hero_vanguard', ffa_paladin: 'hero_vanguard', ffa_fighter: 'hero_vanguard', ffa_hunter: 'hero_vanguard',
  ffa_warrior: 'hero_colossus', ffa_dragoon: 'hero_colossus', ffa_defender: 'hero_colossus',
  ffa_gladiator: 'hero_colossus', ffa_white_monk: 'hero_colossus', ffa_templar: 'hero_colossus',
  ffa_white_mage: 'hero_magus', ffa_black_mage: 'hero_magus', ffa_illusionist: 'hero_magus', ffa_blue_mage: 'hero_magus',
  ffa_time_mage: 'hero_magus', ffa_alchemist: 'hero_magus', ffa_sage: 'hero_magus', ffa_beastmaster: 'hero_magus',
  ffa_morpher: 'hero_magus', ffa_elementalist: 'hero_magus', ffa_red_mage: 'hero_magus', ffa_summoner: 'hero_magus',
  ffa_bishop: 'hero_magus',
  ffa_thief: 'hero_shade', ffa_ninja: 'hero_shade', ffa_archer: 'hero_shade', ffa_fencer: 'hero_shade',
  ffa_assassin: 'hero_shade', ffa_sniper: 'hero_shade',
  ffa_mog_knight: 'hero_cogling', ffa_gunner: 'hero_cogling', ffa_juggler: 'hero_cogling',
  ffa_gadgeteer: 'hero_cogling', ffa_animist: 'hero_cogling',
  // Monsters → original mob_* rigs
  ffa_red_panther: 'mob_duskcat', ffa_icedrake: 'mob_ashdrake', ffa_bomb: 'mob_cinderwisp', ffa_jelly: 'mob_gloomling',
  ffa_lamia: 'mob_marshcoil', ffa_malboro: 'mob_snapvine', ffa_floateye: 'mob_orbwatcher', ffa_zombie: 'mob_gravewalker',
  ffa_vampire: 'mob_nightflit', ffa_goblin: 'mob_grubkin', ffa_antlion: 'mob_scuttler', ffa_tonberry: 'mob_shivtail',
  ffa_toughskin: 'mob_gnarljaw',
}

// Original monster rigs authored on the HUMANOID frame (24×32) rather than the beast frame
// — governs which placeholder generator to use if an original rig fails to load.
const HUMANOID_ORIGINALS = new Set<string>(['mob_gravewalker', 'mob_shivtail', 'mob_gnarljaw', 'mob_grubkin'])

/** True if an original rig id uses the humanoid frame (24×32). */
export function isHumanoidMonster(originalId: string): boolean {
  return HUMANOID_ORIGINALS.has(originalId)
}

// ── Mob name → sprite pool ───────────────────────────────────────────────────
// Keywords are ordered most-specific-first.  The resolver hashes the mob name to
// pick a stable sprite from the matching pool, so "Jungle Troll" always looks the same.
// (Regexes carry no FF/WoW/other-game coined terms; matching stays on generic words.)
type KeywordPool = [RegExp, string[]]
const MOB_KEYWORDS: KeywordPool[] = [
  // Beasts / monsters
  [/wolf|wolfkin|panther|cat|tiger|raptor|hound/, ['ffa_red_panther']],
  [/drake|dragon|wyrm|whelp|hydra|dragonkin/, ['ffa_icedrake']],
  [/elemental|infernal|ember|flame|fire|magma|ash|lava/, ['ffa_bomb']],
  [/slime|jelly|ooze|gel|pudding|blob/, ['ffa_jelly']],
  [/snake|serpent|lamia|naga|viper|cobra/, ['ffa_lamia']],
  [/plant|flower|vine|shambler|treant|fungus|mushroom/, ['ffa_malboro']],
  [/eye|gazer|watcher|orb|sentinel|devourer/, ['ffa_floateye']],
  [/zombie|undead|ghoul|corpse|rot|skeleton|wraith|lich/, ['ffa_zombie']],
  [/vampire|bat|blood|nosferatu/, ['ffa_vampire']],
  [/goblin|kobold|imp|gremlin|sapper|sprite/, ['ffa_goblin', 'ffa_tonberry']],
  [/ant|bug|insect|spider|scorpion|beetle|mantis|antlion/, ['ffa_antlion']],
  [/lizard|newt|gecko/, ['ffa_tonberry']],
  [/ogre|troll|brute|golem|giant|ettin|beast/, ['ffa_toughskin']],
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

/**
 * Per-combination original rigs — one drawn sheet for every race x class the character
 * creator allows (23 of them; see `allowedClasses` in src/data/races.ts).
 *
 * Before these existed, all 23 combinations collapsed onto 5 humanoid archetypes and race
 * was expressed *only* as a skin-ramp palette swap, so an Orc Warrior and a Gnome Warrior
 * were the same 24x32 pixels in different colours. These sheets carry race in the silhouette
 * — height, bulk, head size, tusks/horns/ears/beard — which is the part a recolour cannot do.
 *
 * Generated by the standalone rig generator (~/Desktop/diemetric-prite-generator) and landed
 * through tools/importSprite.mjs like all other art. Ids are `hero_<race>_<class>` keyed on
 * RaceType, so this table is mechanical.
 */
export const HERO_ORIGINAL: Record<RaceType, Partial<Record<ClassType, string>>> = {
  human:  { warrior: 'hero_human_warrior',  mage: 'hero_human_mage',  rogue: 'hero_human_rogue',  warlock: 'hero_human_warlock' },
  dwarf:  { warrior: 'hero_dwarf_warrior',  rogue: 'hero_dwarf_rogue' },
  elf:    { warrior: 'hero_elf_warrior',    mage: 'hero_elf_mage',    rogue: 'hero_elf_rogue' },
  orc:    { warrior: 'hero_orc_warrior',    rogue: 'hero_orc_rogue',  warlock: 'hero_orc_warlock' },
  troll:  { warrior: 'hero_troll_warrior',  mage: 'hero_troll_mage',  rogue: 'hero_troll_rogue',  warlock: 'hero_troll_warlock' },
  goblin: { mage: 'hero_goblin_mage',       rogue: 'hero_goblin_rogue', warlock: 'hero_goblin_warlock' },
  gnome:  { mage: 'hero_gnome_mage',        rogue: 'hero_gnome_rogue',  warlock: 'hero_gnome_warlock' },
  tauren: { warrior: 'hero_tauren_warrior' },
}

/** Every original hero rig id — used to preload the sprite cache. */
export const HERO_ORIGINAL_IDS: string[] =
  Object.values(HERO_ORIGINAL).flatMap((byClass) => Object.values(byClass) as string[])

/**
 * Pick a hero sprite for a unit.
 *
 * Default path returns the per-combination original rig directly; `ORIGINAL_SPRITE[id] ?? id`
 * downstream passes these through unchanged, so they need no entry in that table. Under
 * `?ffta` (DEV only) it keeps returning an `ffa_*` roster key so the scaffold still resolves.
 *
 * The `name` hash only matters on the scaffold path, where several jobs share a class pool.
 */
export function heroSpriteId(
  race: RaceType,
  cls: ClassType,
  name: string,
): string {
  if (!useScaffoldArt) {
    // Combinations the creator disallows can still be reached by old saves; fall back to the
    // human rig for that class rather than dropping to a programmatic placeholder blob.
    return HERO_ORIGINAL[race]?.[cls] ?? HERO_ORIGINAL.human[cls] ?? 'hero_human_warrior'
  }
  const pool = HERO_SPRITES[race]?.[cls] ?? HERO_SPRITES.human[cls]
  return pool[strHash(name) % pool.length] ?? pool[0]
}
