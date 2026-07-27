// Talent iconography (original art, authored programmatically in the runtime indexed
// format — same path as itemIcons.ts / placeholderArt.ts).
//
// Every one of the 60 talents shipped with the SAME '🌑' glyph, so the trees carried no
// per-node identity at all: you navigated them by position and text alone. These are
// archetype icons keyed by what a talent DOES (bleed, freeze, drain, crit, …) rather than
// one bespoke drawing per node — a tree is read by silhouette at a glance, and two dozen
// legible shapes reused across every tree beats a hundred mushy ones. The set grows only
// when a new tree would otherwise have to reuse a shape next to itself. The mapping below is arranged so
// no two neighbouring nodes in a tree share an icon.
//
// Ships on the `icon/base` palette, the same UI contract the ability/nav icons use:
//   1–4 steel/bone/white · 5–8 warm (blood, flame, gold) · 9–12 cool (frost, mana)
//   13 nature-green · 14 treasure-gold · 15 arcane-purple
// Talent nodes are tinted by rank state in the tree UI, so these deliberately do NOT
// reserve a rarity channel the way the gear icons do.
//
// Art is 16×16 ASCII in the docs/art-direction.md character key ('.' = transparent,
// '1'–'9' = slots 1–9, 'A'–'F' = slots 10–15), kept reviewable in source.

import { Painter, type IconSketch } from './placeholderArt'
import type { IndexedSprite } from './types'

const IN = 16

function paint(p: Painter, f: number, rows: IconSketch): void {
  if (rows.length !== IN) console.warn(`[talentIcons] frame ${f}: ${rows.length} rows, expected ${IN}`)
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    if (row.length !== IN) console.warn(`[talentIcons] frame ${f} row ${y}: ${row.length} cols, expected ${IN}`)
    for (let x = 0; x < row.length; x++) {
      const c = row.charCodeAt(x)
      if (c === 46) continue
      p.px(f, x, y, c <= 57 ? c - 48 : c - 55)
    }
  }
}

const STILL = { frames: [0], fps: 1, loop: true }

/** Semantic archetype → frame index. */
export const TALENT_ICON = {
  blade: 0, cleave: 1, bleed: 2, guard: 3, impale: 4, fury: 5, stride: 6,
  frostbolt: 7, freeze: 8, shatter: 9, ward: 10, nova: 11,
  skull: 12, drain: 13, eye: 14, vial: 15, dagger: 16, crit: 17, hourglass: 18, pact: 19,
  banner: 20, bash: 21, rage: 22, chain: 23,
} as const
export type TalentIconKey = keyof typeof TALENT_ICON

// ── Warrior / physical ────────────────────────────────────────────────────────
const A_BLADE: IconSketch = [
  '.......44.......', '.......34.......', '.......34.......', '.......34.......',
  '.......34.......', '.......34.......', '.......34.......', '.......34.......',
  '....22222222....', '.......76.......', '.......76.......', '.......76.......',
  '.......76.......', '......8778......', '................', '................',
]
const A_CLEAVE: IconSketch = [
  '................', '............444.', '.........4444...', '.......444......',
  '.....444........', '...444..........', '..44............', '..4.............',
  '..4.............', '..44............', '...44...........', '....444.........',
  '......4444......', '.........444442.', '................', '................',
]
const A_BLEED: IconSketch = [
  '......3333......', '.....322223.....', '.....322223.....', '.....322223.....',
  '......3223......', '.......55.......', '................', '......65........',
  '.....655........', '.....655........', '......65........', '.........65.....',
  '........655.....', '........655.....', '.........65.....', '................',
]
const A_GUARD: IconSketch = [
  '....22222222....', '...2333333332...', '..233333333332..', '..23322222233...',
  '..23322222233...', '..23322222233...', '..233333333332..', '...23333333332..',
  '....2333333332..', '.....23333332...', '......233332....', '.......2332.....',
  '........22......', '................', '................', '................',
]
const A_IMPALE: IconSketch = [
  '.......4........', '.......44.......', '......344.......', '......344.......',
  '......344.......', '......344.......', '......344.......', '......344.......',
  '......344.......', '.....23442......', '.....23442......', '......766.......',
  '......766.......', '......766.......', '.......6........', '................',
]
const A_FURY: IconSketch = [
  '.......8........', '......787.......', '......787.......', '.....78787......',
  '.....78787......', '....7867687.....', '....7866687.....', '...786555687....',
  '...786555687....', '..78655555687...', '..78655555687...', '..7865555687....',
  '...786555687....', '....78655687....', '.....786687.....', '......7887......',
]
const A_STRIDE: IconSketch = [
  '................', '.......33.......', '......3443......', '......3443......',
  '.......33.......', '......2332......', '.....23443......', '....234433......',
  '...2344.33......', '..234...33......', '........33......', '.......3.3......',
  '......33..3.....', '.....33...33....', '....888....88...', '................',
]

// ── Mage / frost ──────────────────────────────────────────────────────────────
const F_FROSTBOLT: IconSketch = [
  '................', '.............BB.', '...........BAAB.', '.........BAAAB..',
  '.......BAAAAB...', '......BAA99AB...', '.....BAA9999B...', '....BAA999AB....',
  '...BAA999AB.....', '..BAA999AB......', '..BA999AB.......', '..B999AB........',
  '..B99AB.........', '...BAB..........', '................', '................',
]
const F_FREEZE: IconSketch = [
  '.......B........', '....B..A..B.....', '.....B.A.B......', '..BB..BAB..BB...',
  '....BB.A.BB.....', '......BAB.......', 'BBBBBAA9AABBBBB.', '......BAB.......',
  '....BB.A.BB.....', '..BB..BAB..BB...', '.....B.A.B......', '....B..A..B.....',
  '.......B........', '................', '................', '................',
]
const F_SHATTER: IconSketch = [
  '....AA....AA....', '...A9A...A9A....', '..A99A..A99A....', '..A99A.A999A....',
  '...A99AA999A....', '....A999999A....', '.....AA99AA.....', '.......AA.......',
  '.....AA99AA.....', '....A999999A....', '...A99AA999A....', '..A99A.A999A....',
  '..A99A..A99A....', '...A9A...A9A....', '....AA....AA....', '................',
]
const F_WARD: IconSketch = [
  '.....BAAAAB.....', '...BA999999AB...', '..BA99AAAA99AB..', '..A99A....A99A..',
  '.BA9A......A9AB.', '.A99A......A99A.', '.A99A......A99A.', '.A99A......A99A.',
  '.A99A......A99A.', '.BA9A......A9AB.', '..A99A....A99A..', '..BA99AAAA99AB..',
  '...BA999999AB...', '.....BAAAAB.....', '................', '................',
]
const F_NOVA: IconSketch = [
  '.......B........', '...B...A...B....', '....B..A..B.....', '.....B.A.B......',
  '..B...BAB...B...', '...BB.9A9.BB....', '.....A999A......', 'BBAAA99C99AAABB.',
  '.....A999A......', '...BB.9A9.BB....', '..B...BAB...B...', '.....B.A.B......',
  '....B..A..B.....', '...B...A...B....', '.......B........', '................',
]

// ── Warlock / affliction ──────────────────────────────────────────────────────
const W_SKULL: IconSketch = [
  '.....444444.....', '...4433333344...', '..443333333344..', '..433333333334..',
  '..433FF333FF334.', '..433FF333FF334.', '..43333F3333334.', '..43333F3333334.',
  '..443333333344..', '...44333333344..', '....4343434344..', '....4343434344..',
  '.....44444444...', '................', '................', '................',
]
const W_DRAIN: IconSketch = [
  '..FF............', '.F55F...........', '.F555F..........', '..F55FF.........',
  '...FF55F........', '.....F55F.......', '......F55F......', '.......F55F.....',
  '........F55F....', '.........F55F...', '..........F55F..', '..........FF55F.',
  '...........F555F', '............F55F', '.............FF.', '................',
]
const W_EYE: IconSketch = [
  '................', '................', '....FFFFFFFF....', '..FF11111111FF..',
  '.F111FFFFFF111F.', 'F11FFF8888FFF11F', 'F1FF888FF888FF1F', 'F1F88F1111F88F1F',
  'F1F88F1111F88F1F', 'F1FF888FF888FF1F', 'F11FFF8888FFF11F', '.F111FFFFFF111F.',
  '..FF11111111FF..', '....FFFFFFFF....', '................', '................',
]
const W_PACT: IconSketch = [
  '................', '....FF....FF....', '...F55F..F55F...', '...F55F..F55F...',
  '...F55FFFF55F...', '...F55555555F...', '..FF55555555FF..', '.F5555555555 5F.',
  '.F555588885555F.', '.F555F8888F555F.', '..F55FF88FF55F..', '...F555FF555F...',
  '....F5555555F...', '.....FF5555F....', '.......FFFF.....', '................',
]

// ── Rogue / assassination ─────────────────────────────────────────────────────
const R_VIAL: IconSketch = [
  '......3333......', '......3223......', '......3223......', '.....33223......',
  '.....32233......', '....332DD233....', '...33DDDDD233...', '..33DDDDDDD33...',
  '..3DDDDDDDDD3...', '..3DDDDDDDDD3...', '..3DDDDDDDDD3...', '..33DDDDDDD33...',
  '...33DDDDD33....', '....3333333.....', '................', '................',
]
const R_DAGGER: IconSketch = [
  '..........44....', '.........344....', '........3442....', '.......3442.....',
  '......3442......', '.....3442.......', '....3442........', '...3442.........',
  '..24422.........', '.2442...........', '.244............', '.24.............',
  '2...............', '................', '................', '................',
]
const R_CRIT: IconSketch = [
  '.......E........', '.......E........', '....E..E..E.....', '.....E.E.E......',
  '......EEE.......', '.......8........', 'EEEE.8E8E8.EEEE.', '......8888......',
  'EEEE.8E8E8.EEEE.', '.......8........', '......EEE.......', '.....E.E.E......',
  '....E..E..E.....', '.......E........', '.......E........', '................',
]
const R_HOURGLASS: IconSketch = [
  '..EEEEEEEEEEEE..', '..E33333333333E.', '...E88888888E...', '....E888888E....',
  '.....E8888E.....', '......E88E......', '.......EE.......', '.......EE.......',
  '......E88E......', '.....E8888E.....', '....E888888E....', '...E88888888E...',
  '..E33333333333E.', '..EEEEEEEEEEEE..', '................', '................',
]

// ── Warrior / Bulwark + Warbringer ────────────────────────────────────────────
// Added for the three-specs-per-class rework. The existing twenty archetypes covered
// Ironcleave completely, but a shield tree and a dual-wield tree kept reaching for the
// same 'guard' and 'fury' shapes, which is how a tree stops being readable by silhouette.
const A_BANNER: IconSketch = [
  '....444444......', '....466664......', '....466664......', '....466664......',
  '....4666644.....', '....46666664....', '....4666664.....', '....466664......',
  '....44444.......', '......33........', '......33........', '......33........',
  '......33........', '.....3223.......', '....322223......', '................',
]
const A_BASH: IconSketch = [
  '..8..........8..', '...8..2222..8...', '....22333322....', '...2333333332...',
  '...2338888332...', '...2338888332...', '...2333333332...', '8...23333332...8',
  '....23333332....', '.....233332.....', '......2332......', '.......22.......',
  '..8..........8..', '................', '................', '................',
]
const A_RAGE: IconSketch = [
  '.......5........', '......565.......', '......675.......', '.....56765......',
  '.....67876......', '....5678765.....', '....6788876.....', '...567888765....',
  '...667888766....', '..56788888765...', '..66788888766...', '..56678887665...',
  '...566787665....', '....5566655.....', '.....55555......', '................',
]
const A_CHAIN: IconSketch = [
  '....2222........', '...2....2.......', '..22....22......', '..2......2......',
  '..2......2......', '..22....22......', '...2....2.......', '....22222222....',
  '.......2....2...', '......22....22..', '......2......2..', '......2......2..',
  '......22....22..', '.......2....2...', '........2222....', '................',
]

const SKETCHES: IconSketch[] = [
  A_BLADE, A_CLEAVE, A_BLEED, A_GUARD, A_IMPALE, A_FURY, A_STRIDE,
  F_FROSTBOLT, F_FREEZE, F_SHATTER, F_WARD, F_NOVA,
  W_SKULL, W_DRAIN, W_EYE, R_VIAL, R_DAGGER, R_CRIT, R_HOURGLASS, W_PACT,
  A_BANNER, A_BASH, A_RAGE, A_CHAIN,
]

export function makeTalentIconSheet(id = 'icons/talent'): IndexedSprite {
  const n = SKETCHES.length
  const p = new Painter(IN, IN, n)
  for (let f = 0; f < n; f++) paint(p, f, SKETCHES[f])
  return {
    id, frameW: IN, frameH: IN, cols: n, frameCount: n,
    indices: p.data, anchor: { x: 8, y: 8 },
    animations: {
      idle: { se: STILL, ne: STILL }, walk: { se: STILL, ne: STILL },
      attack: { se: STILL, ne: STILL }, hit: { se: STILL, ne: STILL },
    },
  }
}

/**
 * Talent id → archetype. Keyed by what the talent does, and laid out so adjacent nodes in
 * a tree differ. Anything unmapped falls through to the emoji path in SpriteIcon, so a
 * newly authored talent renders rather than vanishing.
 */
export const TALENT_ICON_BY_ID: Record<string, TalentIconKey> = {
  // ── Ironcleave (warrior) ──
  arms_heroic_strike: 'blade',     arms_deflection: 'guard',       arms_improved_rend: 'bleed',
  arms_imp_charge: 'stride',       arms_tactical_mastery: 'hourglass', arms_thunder_clap: 'nova',
  arms_overpower: 'impale',        arms_anger_management: 'fury',  arms_deep_wounds: 'bleed',
  arms_two_handed: 'blade',        arms_impale: 'impale',          arms_war_cry: 'banner',
  arms_axe_spec: 'cleave',         arms_sweeping_strikes: 'cleave', arms_sword_spec: 'blade',
  arms_executioner: 'cleave',      arms_hamstring: 'chain',        arms_mortal_strike: 'crit',
  arms_juggernaut: 'impale',       arms_bladestorm: 'rage',

  // ── Bulwark (warrior) ──
  bul_iron_hide: 'guard',          bul_shield_spec: 'bash',        bul_toughness: 'fury',
  bul_anticipation: 'eye',         bul_defiance: 'guard',          bul_improved_bash: 'bash',
  bul_second_wind: 'drain',        bul_improved_shield_wall: 'ward', bul_retaliation: 'nova',
  bul_bulwark_stance: 'guard',     bul_spiked_shield: 'bash',      bul_unyielding: 'fury',
  bul_shield_mastery: 'bash',      bul_indomitable: 'drain',       bul_stalwart: 'guard',
  bul_absorption: 'ward',          bul_vengeance: 'blade',         bul_iron_will: 'drain',
  bul_fortress: 'guard',           bul_last_stand: 'skull',

  // ── Warbringer (warrior) ──
  wbr_cruelty: 'dagger',           wbr_booming_voice: 'banner',    wbr_frenzy: 'stride',
  wbr_unbridled_wrath: 'rage',     wbr_piercing_howl: 'chain',     wbr_blood_craze: 'bleed',
  wbr_flurry: 'crit',              wbr_enrage: 'rage',             wbr_savage_blows: 'impale',
  wbr_dual_wield_spec: 'blade',    wbr_bloodthirst: 'bleed',       wbr_death_wish: 'rage',
  wbr_improved_slam: 'cleave',     wbr_rampage: 'rage',            wbr_precision: 'dagger',
  wbr_bloodsurge: 'bleed',         wbr_titans_grip: 'impale',      wbr_endless_rage: 'stride',
  wbr_unquenchable: 'drain',       wbr_reckless_abandon: 'skull',

  // ── Frost (mage) ──
  frost_warding: 'ward',           frost_imp_frostbolt: 'frostbolt', frost_ice_shards: 'shatter',
  frost_frostbite: 'freeze',       frost_imp_frost_nova: 'nova',     frost_permafrost: 'freeze',
  frost_piercing_ice: 'impale',    frost_cold_snap: 'hourglass',     frost_imp_blizzard: 'nova',
  frost_arctic_reach: 'frostbolt', frost_channeling: 'hourglass',    frost_shatter: 'shatter',
  frost_ice_block: 'ward',         frost_cone_of_cold: 'frostbolt',  frost_ice_barrier: 'ward',
  frost_winters_chill: 'freeze',

  // ── Affliction (warlock) ──
  aff_suppression: 'eye',          aff_imp_corruption: 'skull',    aff_imp_weakness: 'drain',
  aff_drain_soul: 'drain',         aff_life_tap: 'pact',           aff_imp_agony: 'skull',
  aff_fel_concentration: 'hourglass', aff_amplify_curse: 'eye',    aff_grim_reach: 'eye',
  aff_dark_pact: 'pact',           aff_curse_exhaustion: 'hourglass', aff_drain_life: 'drain',
  aff_imp_exhaustion: 'stride',    aff_nightfall: 'crit',          aff_siphon_life: 'drain',

  // ── Assassination (rogue) ──
  ass_improved_eviscerate: 'dagger', ass_remorseless: 'crit',      ass_malice: 'crit',
  ass_ruthlessness: 'dagger',      ass_murder: 'skull',            ass_slice_dice: 'hourglass',
  ass_expose_armor: 'guard',       ass_lethality: 'dagger',        ass_vile_poisons: 'vial',
  ass_improved_poisons: 'vial',    ass_cold_blood: 'crit',         ass_seal_fate: 'crit',
  ass_vigor: 'stride',
}
