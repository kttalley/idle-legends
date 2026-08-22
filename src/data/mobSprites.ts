import type { MobId } from './types'

// ── Mob sprite bindings ───────────────────────────────────────────────────────
// Generated. Maps Stillmarch mob ids to FFTA-derived sprite ids.
//
// Source of truth for the mob ids: `src/data/zones.ts` (every `mobs[]` entry of every
// zone in `ZONE_ORDER`). Source of truth for the sprite ids: the rigged `.aseprite`
// files in `tools/_aseprite_output/<spriteId>.aseprite`, built from the converted units
// in `local-assets/ffta-scaffold/ffta-units/`. The human-readable table behind each
// choice — mob → sprite → rationale, grouped by zone — lives at
// `tools/_aseprite_output/_mob_mapping.md`.
//
// Sprites are shared: there are far more mobs than rigs, so several ids below point at
// the same sprite. Within any single zone the four mobs always resolve to four distinct
// sprites, so no two enemies on screen at once wear the same art.
//
// **That guarantee has to hold TWICE, and originally only held once.** These are scaffold
// rig names, and a shipped build resolves every one of them through `ORIGINAL_SPRITE` onto
// a much smaller set of drawn sheets (41 rigs → 21 sheets, because the de-pooling in
// fftaRoster is unfinished). Distinctness at the rig level therefore says nothing about
// what the player sees: seven zones drew two mobs on one sheet after the collapse — the
// Bandit Warlord and the Harrowfield Golem were the same figure, and so were the Rotting
// Shambler and the Skeletal Archer.
//
// The bindings marked `was ffa_*` below are the fix, chosen to keep the mob's character
// while landing on a free sheet. Verified by walking every zone at BOTH tiers; if you
// change one, re-check the collapsed tier and not just this table.
//
// Every sprite carries 18 tags on two layers (`shadow` below, `pixel` above). Frame
// counts vary per unit because they come from the ROM's own pose scripts:
//
//   idle-se   / idle-ne     derived from the walk cycle's legs-together frame
//   walk-se   / walk-ne     the A B C B cycle
//   attack-se / attack-ne   humanoids swing a weapon; beasts lunge/bite
//   cast-se   / cast-ne     spell or item
//   ready-se  / ready-ne    brace
//   flinch-se / flinch-ne   damage reaction (held recoil -> deeper lean-back)
//   kneel-se  / kneel-ne    low-health crouch
//   ko-se     / ko-ne       downed, prone
//   jump-se   / jump-ne     compress and leave the ground
//
// `kneel` and `ko` are worth wiring to the combat layer — the PLAN.md audit called out
// that level-ups and damage states are invisible in the world, and these are the poses
// for it. There is no `hit` tag: the old one aliased attack frames and was never a pose.
//
// Frame widths differ per unit (16/24/32/40 px, all 40 tall): the canvas is each unit's
// bounding box across all 24 poses, so a class with a wide weapon swing is wider. Use the
// manifest `anchor` for placement, not the canvas centre.

export const MOB_SPRITE: Record<MobId, string> = {
  // Sunhollow Meadows
  grey_wolf: 'ffa_direwolf',
  kobold_miner: 'ffa_goblin',
  farm_boar: 'ffa_dire_boar',
  meadow_beast: 'ffa_chimera',

  // Dustwind Plains
  dustwind_thug: 'ffa_dune_raider',
  harvest_golem: 'ffa_stone_warden',
  plains_vulture: 'ffa_carrion_bird',
  bandit_warlord: 'ffa_fighter',   // was ffa_bandit_brute — dustwind: brute and stone_warden both collapse to hero_colossus

  // Grimshade Forest
  rotting_shambler: 'ffa_toughskin',   // was ffa_zombie — grimshade: keeps the SKELETON for the Skeletal Archer beside it
  grimshade_worgen: 'ffa_grim_wolfkin',
  skeletal_archer: 'ffa_bone_archer',
  death_arbiter: 'ffa_vampire',

  // Thornvale Jungle
  jungle_troll: 'ffa_bog_troll',
  jade_raptor: 'ffa_rot_crawler',
  tiger_stalker: 'ffa_red_panther',
  troll_warchief: 'ffa_gladiator',

  // Ashfire Peaks
  dragonkin_whelp: 'ffa_lamia',   // was ffa_icedrake — ashfire: icedrake and frost_wyrm both collapse to mob_ashdrake
  flame_elemental: 'ffa_bomb',
  lava_golem: 'ffa_iron_sentinel',   // was ffa_magma_brute (collided with bomb on mob_cinderwisp), then ffa_toughskin — a golem belongs on the construct sheet
  flame_wyrm: 'ffa_frost_wyrm',

  // Shattered Crossing
  scarred_soldier: 'ffa_soldier',
  war_deserter: 'ffa_fighter',   // was ffa_war_deserter — crossing: deserter and soldier both collapse to hero_vanguard
  bridge_mercenary: 'ffa_fencer',
  crossing_war_golem: 'ffa_iron_sentinel',

  // The Bloodfields
  grave_risen: 'ffa_zombie',
  field_marauder: 'ffa_fighter',
  warzone_golem: 'ffa_stone_warden',
  bloodfield_warlord: 'ffa_paladin',   // was ffa_defender — bloodfields: defender and stone_warden both collapse to hero_colossus

  // Ironcrag Badlands
  orc_raider: 'ffa_warrior',
  goblin_sapper: 'ffa_goblin',
  iron_shaman: 'ffa_storm_caller',
  ironcrag_overlord: 'ffa_paladin',   // was ffa_templar — ironcrag: templar and warrior both collapse to hero_colossus

  // Venom Hollows
  troll_berserker: 'ffa_bog_troll',
  swamp_viper: 'ffa_lamia',
  witch_doctor: 'ffa_summoner',
  venom_hexlord: 'ffa_hexknight',

  // Wardrum Mesa
  warsong_grunt: 'ffa_warrior',
  orc_warlock: 'ffa_black_mage',
  mesa_blademaster: 'ffa_ninja',
  warsong_chieftain: 'ffa_paladin',   // was ffa_dragoon — mesa: dragoon and warrior both collapse to hero_colossus

  // Cinderfall Wastes
  ash_stalker: 'ffa_assassin',
  ruin_infernal: 'ffa_magma_brute',
  void_warlock: 'ffa_illusionist',
  cinder_dreadlord: 'ffa_vampire',

  // The Maw Eternal
  abyss_champion: 'ffa_white_monk',
  maw_devourer: 'ffa_ashen_maw',
  eternal_shaman: 'ffa_sage',
  maw_warlord: 'ffa_paladin',
}

/** The tags every rig in `MOB_SPRITE` is guaranteed to carry. */
export const MOB_SPRITE_TAGS = [
  'idle-se', 'idle-ne',
  'walk-se', 'walk-ne',
  'attack-se', 'attack-ne',
  'flinch-se', 'flinch-ne',
] as const

export type MobSpriteTag = typeof MOB_SPRITE_TAGS[number]
