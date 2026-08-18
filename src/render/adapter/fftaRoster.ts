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
import { MOB_SPRITE } from '../../data/mobSprites'

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

/**
 * Which hero art the build is showing.
 *
 *   revampv1  DEFAULT — one drawn rig per race x class (23 sheets, `hero_<race>_<class>`)
 *   original  `?original` — the pre-revamp archetypes, several roster keys per sheet,
 *             race carried only by the skin ramp. This is what shipped before 22eb736.
 *   ffta      `?ffta` — the DEV-only extracted scaffold. See `useScaffoldArt`.
 *
 * ART SELECTION IS TWO INDEPENDENT DECISIONS and this is why they are separate consts:
 *
 *   WHICH ROSTER KEY a unit gets — `hero_<race>_<class>` or a pooled `ffa_*` key. That is
 *   `usePooledRosterKeys`, below, and it is what `heroSpriteId()` branches on.
 *
 *   WHERE THE ART COMES FROM — `public/sprites/units/` or the gitignored scaffold. That is
 *   `useScaffoldArt`, and NOTHING ELSE MAY GATE IT. It is the IP lock, it folds to the
 *   literal `false` in a production build, and that fold is what strips the `local-assets/…`
 *   URL strings out of the release bundle entirely.
 *
 * They were welded to one boolean because there were only ever two modes, and both of the
 * old modes happened to agree on both questions. `original` is the case that separates them:
 * it wants the POOLED keys (like the scaffold) resolved from SHIPPED art (like the default).
 *
 * `original` is deliberately available in production builds, unlike `?ffta`. It resolves
 * through `ORIGINAL_SPRITE` to files already in `public/sprites/units/`, so there is nothing
 * unshippable behind it — it is a comparison toggle, not a licence risk. `?ffta` wins if both
 * are passed, since it is the more specific tool.
 */
export type HeroArtMode = 'revampv1' | 'original' | 'ffta'

const artParams = typeof location === 'undefined' ? null : new URLSearchParams(location.search)

export const heroArtMode: HeroArtMode =
  useScaffoldArt ? 'ffta' : artParams?.has('original') ? 'original' : 'revampv1'

/**
 * True when `heroSpriteId()` should return a pooled `ffa_*` roster key rather than a
 * per-combination rig id. Both non-default modes want the pools; only the scaffold mode also
 * wants scaffold pixels.
 */
export const usePooledRosterKeys: boolean = heroArtMode !== 'revampv1'

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
// unit silently degrades to a programmatic placeholder. All 21 verified present.
//
// De-pooling in progress: 47 keys → 21 distinct sprites. The vanguard pool is done — its
// four jobs each have their own rig. Four pools still share one archetype apiece and are
// the remaining work: colossus (6), magus (13), shade (6), cogling (5).
export const ORIGINAL_SPRITE: Record<string, string> = {
  // Vanguard pool — one rig per job (Hume line: 16x40 / 10-tile proportion)
  ffa_soldier: 'hero_vanguard', ffa_paladin: 'hero_oathbound', ffa_fighter: 'hero_breaker', ffa_hunter: 'hero_stalker',
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

  // ── The rigs `MOB_SPRITE` names, collapsed onto shipped originals ─────────────
  // `data/mobSprites.ts` binds every mob to a scaffold rig, and eighteen of those rigs
  // have no drawn counterpart yet. Without an entry here each one degrades to a
  // programmatic placeholder blob in the shipped build — which is the exact failure this
  // file's header records from 2026-08-01, when the whole game shipped as blobs because
  // the art path was gated on a flag no packaged build could set.
  //
  // Mapped by WHAT THE CREATURE IS rather than by name, so the collapse is legible: canines
  // and cats to the duskcat, anything armoured and enormous to the colossus, casters to the
  // magus, undead to the gravewalker. Several rigs share a target on purpose — variety
  // comes from palette, and `resolveMobSprite` guarantees no two mobs in one zone land on
  // the same sheet.
  ffa_direwolf: 'mob_duskcat', ffa_grim_wolfkin: 'mob_duskcat',
  // The boar is FOUR-LEGGED and was drawing on `mob_gnarljaw`, which is a bipedal brute in
  // a loincloth. A quadruped on a two-legged rig is the most obviously wrong a sprite can
  // be, so it moves to the dog-shaped sheet even though the wolf in its starting zone is
  // already there — two similar quadrupeds beat one boar standing upright.
  //
  // KNOWN ART GAP, recorded rather than papered over: `mob_duskcat` is the ONLY drawn
  // quadruped, and mob palettes vary by boss/elite/normal rather than per mob, so the Grey
  // Wolf and the Rampaging Boar are now the same figure in Sunhollow. The fix is a second
  // four-legged sheet (something tusked and heavy); until that exists this is the least
  // wrong arrangement available.
  ffa_dire_boar: 'mob_duskcat',
  ffa_bog_troll: 'mob_gnarljaw',
  ffa_chimera: 'mob_ashdrake', ffa_frost_wyrm: 'mob_ashdrake', ffa_carrion_bird: 'mob_ashdrake',
  ffa_rot_crawler: 'mob_scuttler',
  ffa_magma_brute: 'mob_cinderwisp',
  ffa_ashen_maw: 'mob_snapvine',
  // The skeleton. `ffa_bone_archer` is the scaffold's bone rig and `mob_gravewalker` is the
  // drawn one; binding them means the skeleton is the same creature in both art modes,
  // which is what lets it be the default fallback below.
  ffa_bone_archer: 'mob_gravewalker',
  // Humanoid mobs take hero rigs — they are people, and the enemy palette is what makes
  // them read as hostile.
  ffa_dune_raider: 'hero_shade',
  ffa_bandit_brute: 'hero_colossus', ffa_stone_warden: 'hero_colossus',
  ffa_iron_sentinel: 'hero_colossus',
  ffa_war_deserter: 'hero_vanguard',
  ffa_storm_caller: 'hero_magus',
  ffa_hexknight: 'hero_oathbound',
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
  // The undead pool, widened. It matched `skeleton` — and every skeletal enemy in the game
  // is called SKELETAL, which the pattern does not match, so the Skeletal Archer fell all
  // the way through twenty pools to the random-monster fallback and rendered as a floating
  // eye. Same for the Grave-Risen Soldier, which matched `soldier` first and came out as a
  // living swordsman. Net effect: `mob_gravewalker` — the one undead rig in the shipped
  // set — was reachable by NO mob in the bestiary, only by the roaming ambient crowd.
  // Stems rather than whole words (`skelet` covers skeleton/skeletal), and `\b` on the
  // short ones so "Brotherhood" and "Bonecrusher"-style names cannot be dragged in.
  [/zombie|undead|ghoul|corpse|\brot|skelet|\bbone|grave|risen|crypt|tomb|barrow|revenant|wight|wraith|lich/, ['ffa_zombie']],
  [/vampire|bat|blood|nosferatu/, ['ffa_vampire']],
  [/goblin|kobold|imp|gremlin|sapper|sprite/, ['ffa_goblin', 'ffa_tonberry']],
  [/ant|bug|insect|spider|scorpion|beetle|mantis|antlion/, ['ffa_antlion']],
  [/lizard|newt|gecko/, ['ffa_tonberry']],
  // `beast` left this pool: it is the generic word for a four-legged animal, and sending it
  // to `ffa_toughskin` (a bipedal brute) put every unmapped creature on two legs.
  [/ogre|troll|brute|golem|giant|ettin/, ['ffa_toughskin']],
  [/boar|pig|hog|swine|beast|bear|stag|ram|goat|ox|drake-hound/, ['ffa_direwolf']],
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

/**
 * Pick a sprite for a mob.
 *
 * Three tiers, most-specific first, and the order is the whole point:
 *
 *   1. `MOB_SPRITE[templateId]` — the CURATED table (data/mobSprites.ts). Every mob in
 *      every zone was assigned a rig by hand, checked for per-zone distinctness. It was
 *      generated months ago and then wired to nothing, which is why a "Skeletal Archer"
 *      rendered as a floating eye: the table said `ffa_bone_archer` and no code read it.
 *   2. The keyword pools — for anything with no table entry: duel opponents, ambient
 *      monsters, and any mob added to a zone without updating the table.
 *   3. The SKELETON. Not a random monster.
 *
 * That last change matters more than it looks. The old fallback picked from
 * `MONSTER_SPRITES` by name hash, so an unmatched mob got an arbitrary creature — which is
 * how "Grave-Risen Soldier" became a lamia and "Skeletal Archer" a floating eye. An
 * arbitrary-but-stable answer is still arbitrary, and it produces exactly the mismatches
 * that make a bestiary feel randomly assembled. Defaulting to one strong, legible,
 * unmistakably-hostile rig means an unmapped mob reads as "some undead thing" rather than
 * as a category error — and undead is the safest possible default in a world whose every
 * zone is a battlefield somebody already lost.
 */
export function resolveMobSprite(name: string, templateId?: string): string {
  if (templateId) {
    const mapped = MOB_SPRITE[templateId]
    if (mapped) return mapped
  }
  const n = name.toLowerCase()
  for (const [re, pool] of MOB_KEYWORDS) {
    if (re.test(n)) return pool[strHash(n) % pool.length]
  }
  return DEFAULT_MOB_SPRITE
}

/**
 * The fallbacks, and there are TWO because a body has a shape.
 *
 * Making the skeleton the single universal default was an over-correction: it fixed
 * unmapped HUMANOIDS (which used to come out as a faceless programmatic figure) and broke
 * unmapped BEASTS, which then came out as bipedal undead. A boar drawn standing upright is
 * not an improvement on a boar drawn as a blank.
 *
 * So: anything that reads as a creature falls back to the four-legged sheet, anything that
 * reads as a person falls back to the skeleton. Both are drawn, both ship, and neither is
 * ever a placeholder blob.
 */
export const DEFAULT_MOB_SPRITE = 'ffa_bone_archer'
/** Four-legged fallback — resolves to `mob_duskcat`, the one drawn quadruped. */
export const DEFAULT_BEAST_SPRITE = 'ffa_direwolf'

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

/** Every per-combination hero rig id — used to preload the sprite cache in `revampv1`. */
export const HERO_ORIGINAL_IDS: string[] =
  Object.values(HERO_ORIGINAL).flatMap((byClass) => Object.values(byClass) as string[])

/**
 * Every pooled roster key any hero can be assigned — the preload set for `original` and
 * `ffta`. Derived from the pools rather than from a second hand-written race/class list, so
 * adding a job to a pool cannot leave its sprite unpreloaded.
 */
export const HERO_POOLED_IDS: string[] = [
  ...new Set(Object.values(HERO_SPRITES).flatMap((byClass) => Object.values(byClass).flat())),
]

/** The roster keys to warm the sprite cache with, for whichever mode is active. */
export const heroPreloadIds = (): string[] =>
  usePooledRosterKeys ? HERO_POOLED_IDS : HERO_ORIGINAL_IDS

/**
 * Pick a hero sprite for a unit.
 *
 * `revampv1` returns the per-combination rig directly; `ORIGINAL_SPRITE[id] ?? id` downstream
 * passes those through unchanged, so they need no entry in that table. `original` and `ffta`
 * both return a pooled `ffa_*` roster key — `original` then resolves it through
 * `ORIGINAL_SPRITE` to a shipped archetype, `ffta` to the scaffold.
 *
 * The `name` hash only matters on the pooled paths, where several jobs share a class pool.
 */
export function heroSpriteId(
  race: RaceType,
  cls: ClassType,
  name: string,
): string {
  if (!usePooledRosterKeys) {
    // Combinations the creator disallows can still be reached by old saves; fall back to the
    // human rig for that class rather than dropping to a programmatic placeholder blob.
    return HERO_ORIGINAL[race]?.[cls] ?? HERO_ORIGINAL.human[cls] ?? 'hero_human_warrior'
  }
  const pool = HERO_SPRITES[race]?.[cls] ?? HERO_SPRITES.human[cls]
  return pool[strHash(name) % pool.length] ?? pool[0]
}
