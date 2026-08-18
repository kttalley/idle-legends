# Mob → sprite mapping

Generated alongside `src/data/mobSprites.ts`.

- **Mobs**: every `mobs[]` entry of every zone in `src/data/zones.ts` — 12 zones × 4 = **48 mobs**.
- **Sprites**: rigged `.aseprite` files in `tools/_aseprite_output/`, built from
  `local-assets/ffta-scaffold/ffta-units/`. **71 rigs** exist; **41 distinct** are used here.
- Each zone's 4th mob is its `bossId` — marked **BOSS** below.
- Within a zone all four mobs resolve to four distinct sprites, so no two enemies on
  screen at once share art. Sprites *are* reused across zones (7 of them appear twice).

Every rig used here has the same shape: 16 frames, layers `shadow` + `pixel`, and 8 tags
(`idle-se/ne`, `walk-se/ne`, `attack-se/ne`, `flinch-se/ne`).

---

## Sunhollow Meadows (`sunhollow_meadows`, lv 1–10)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `grey_wolf` | Grey Wolf | `ffa_direwolf` | Quadruped canine rig — the literal match. |
| `kobold_miner` | Kobold Miner | `ffa_goblin` | Small hunched tool-carrying humanoid; kobold and goblin read identically at 16px. |
| `farm_boar` | Rampaging Boar | `ffa_dire_boar` | Composed tusked quadruped boar, named for this mob. |
| `meadow_beast` | Elder Meadow Beast | `ffa_chimera` | **BOSS.** Spiky multi-limbed beast — boss-scale silhouette, clearly not the wolf. |

## Dustwind Plains (`dustwind_plains`, lv 10–20)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `dustwind_thug` | Dustwind Thug | `ffa_dune_raider` | Composed hooded desert raider, named for this zone. |
| `harvest_golem` | Harrowfield Golem | `ffa_stone_warden` | Composed blocky armored construct. |
| `plains_vulture` | Plains Vulture | `ffa_carrion_bird` | Composed winged carrion bird — the only avian rig in the set. |
| `bandit_warlord` | Bandit Warlord Grak | `ffa_bandit_brute` | **BOSS.** Composed hulking bandit; reads a full weight class above the raider trash. |

## Grimshade Forest (`grimshade_forest`, lv 20–30)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `rotting_shambler` | Rotting Shambler | `ffa_zombie` | Direct match. |
| `grimshade_worgen` | Grimshade Wolfkin | `ffa_grim_wolfkin` | Composed bipedal wolf-humanoid, named for this mob. |
| `skeletal_archer` | Skeletal Archer | `ffa_bone_archer` | Composed pale skeletal archer. |
| `death_arbiter` | Death Arbiter Malachar | `ffa_vampire` | **BOSS.** *Stretch* — closest undead spellcaster-lord (robed, winged cape); no lich rig exists. |

## Thornvale Jungle (`thornvale_jungle`, lv 30–40)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `jungle_troll` | Jungle Troll | `ffa_bog_troll` | Composed and named for the troll mobs. *Caveat:* reads as a maw-headed plant-monster, not a lanky humanoid troll. |
| `jade_raptor` | Jade Raptor | `ffa_rot_crawler` | *Stretch* — chosen on silhouette, not name: a low four-limbed crawler with a lashing tail reads as a raptor. |
| `tiger_stalker` | Thornvale Tiger | `ffa_red_panther` | Big-cat rig; exact match. |
| `troll_warchief` | Drumlord Vorthak | `ffa_gladiator` | **BOSS.** Bangaa champion with a heavy blade — the imposing humanoid the trolls' trash isn't. |

## Ashfire Peaks (`ashfire_peaks`, lv 40–50)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `dragonkin_whelp` | Dragonkin Whelp | `ffa_icedrake` | Small draconic quadruped. |
| `flame_elemental` | Flame Elemental | `ffa_bomb` | The FFTA bomb — a floating elemental ball. |
| `lava_golem` | Lava Golem | `ffa_magma_brute` | Composed bulky brute, named for this mob. |
| `flame_wyrm` | Ashfire Flame Wyrm | `ffa_frost_wyrm` | **BOSS.** Composed boss-scale wyrm perched on rock. Name says frost, but the shared unit palette means no element reads off the sprite anyway. |

## Shattered Crossing (`shattered_crossing`, lv 45–55, contested)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `scarred_soldier` | Scarred Soldier | `ffa_soldier` | Direct match. |
| `war_deserter` | War Deserter | `ffa_war_deserter` | Composed and named for this exact mob. |
| `bridge_mercenary` | Bridge Mercenary | `ffa_fencer` | Blade-for-hire duelist; distinct from the zone's regular soldier. |
| `crossing_war_golem` | Siege War Golem | `ffa_iron_sentinel` | **BOSS.** Composed armored construct at boss weight. |

## The Bloodfields (`the_bloodfields`, lv 50–60, contested)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `grave_risen` | Grave-Risen Soldier | `ffa_zombie` | Reuse of the Grimshade shambler — same risen-dead archetype. |
| `field_marauder` | Field Marauder | `ffa_fighter` | Human melee raider with an axe. |
| `warzone_golem` | Warzone Golem | `ffa_stone_warden` | Reuse — same construct family as the Harrowfield Golem. |
| `bloodfield_warlord` | Warlord Kessith the Unyielding | `ffa_defender` | **BOSS.** Shield-forward bangaa tank; "Unyielding" picked the rig. |

## Ironcrag Badlands (`ironcrag_badlands`, lv 55–70, horde)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `orc_raider` | Orc Raider | `ffa_warrior` | Bangaa heavy — the closest thing to an orc silhouette in the set. |
| `goblin_sapper` | Goblin Demolitionist | `ffa_goblin` | Exact creature match; reuse of the kobold rig 7 zones earlier. |
| `iron_shaman` | Ironcrag Shaman | `ffa_storm_caller` | Composed primal caster, named for a shaman-type. |
| `ironcrag_overlord` | Overlord Drogmar Ironjaw | `ffa_templar` | **BOSS.** Heaviest armored bangaa champion available. |

## Venom Hollows (`venom_hollows`, lv 65–80, horde)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `troll_berserker` | Troll Berserker | `ffa_bog_troll` | Reuse — deliberately the same rig as Jungle Troll, so trolls look like trolls. |
| `swamp_viper` | Swamp Viper | `ffa_lamia` | Coiled serpentine rig. |
| `witch_doctor` | Troll Witch-Doctor | `ffa_summoner` | Robed ritual caster; the masked-summoner read fits a witch-doctor. |
| `venom_hexlord` | Hexcaller Zal'grak the Venomous | `ffa_hexknight` | **BOSS.** Composed robed caster with an orbiting hex mote — a "Hexcaller" by name and by art. |

## Wardrum Mesa (`warsong_mesa`, lv 75–90, horde)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `warsong_grunt` | Wardrum Grunt | `ffa_warrior` | Reuse — same orc-footsoldier look as the Ironcrag raider, on purpose. |
| `orc_warlock` | Orc Warlock | `ffa_black_mage` | Pointed-hat tome caster; matches the fel-tome / shadow-vestments loot. |
| `mesa_blademaster` | Mesa Blademaster | `ffa_ninja` | *Stretch* — picked for the fast dual-blade read (1.6s attack, swift bracers); the silhouette is small and human rather than orcish. |
| `warsong_chieftain` | Chieftain Rok'nar Bloodroar | `ffa_dragoon` | **BOSS.** Horned-helm bangaa champion, distinct from the zone's grunts. |

## Cinderfall Wastes (`cinderfall_wastes`, lv 85–100, horde)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `ash_stalker` | Ash Stalker | `ffa_assassin` | Cloaked dagger rogue; matches the `mob_rogue` sprite key and soot-dagger loot. |
| `ruin_infernal` | Ruin Infernal | `ffa_magma_brute` | Reuse — bulky fire construct, same family as the Lava Golem. |
| `void_warlock` | Void-Touched Warlock | `ffa_illusionist` | Robed arcane caster, kept visually distinct from the orc warlock's black mage. |
| `cinder_dreadlord` | Balelord Ashvael the Burning | `ffa_vampire` | **BOSS.** *Reuse, flagged* — the only winged dark-lord rig, already spent on Malachar in Grimshade. Both are dark-lord archetypes, but the two bosses will look the same. |

## The Maw Eternal (`the_maw_eternal`, lv 95–100, horde)

| Mob | Name | Sprite | Rationale |
|---|---|---|---|
| `abyss_champion` | Abyss Champion | `ffa_white_monk` | *Stretch* — last unused heavy humanoid; a bare-handed bangaa brawler against "void plate" loot. |
| `maw_devourer` | Maw Devourer | `ffa_ashen_maw` | Composed devouring-maw horror. Best single match in the whole roster. |
| `eternal_shaman` | Eternal Shaman | `ffa_sage` | Elder robed caster — reads a tier above the Ironcrag storm-caller. |
| `maw_warlord` | Warlord Zar'goth the Eternal | `ffa_paladin` | **BOSS.** Crowned armored champion for the final boss. Mild mismatch: the rig reads "holy" rather than abyssal. |

---

## Sprites reused across zones

| Sprite | Mobs |
|---|---|
| `ffa_zombie` | `rotting_shambler`, `grave_risen` |
| `ffa_goblin` | `kobold_miner`, `goblin_sapper` |
| `ffa_stone_warden` | `harvest_golem`, `warzone_golem` |
| `ffa_bog_troll` | `jungle_troll`, `troll_berserker` |
| `ffa_magma_brute` | `lava_golem`, `ruin_infernal` |
| `ffa_warrior` | `orc_raider`, `warsong_grunt` |
| `ffa_vampire` | `death_arbiter`, `cinder_dreadlord` |

## Rigs built but unused

30 rigs go unused — mostly FFTA job classes with no counterpart in this roster
(`ffa_alchemist`, `ffa_animist`, `ffa_archer`, `ffa_beastmaster`, `ffa_bishop`,
`ffa_blue_mage`, `ffa_elementalist`, `ffa_gadgeteer`, `ffa_gunner`, `ffa_hunter`,
`ffa_juggler`, `ffa_mog_knight`, `ffa_morpher`, `ffa_red_mage`, `ffa_skyguard`,
`ffa_sniper`, `ffa_sprite`, `ffa_thief`, `ffa_time_mage`, `ffa_white_mage`) and
bestiary units the zones never call for (`ffa_antlion`, `ffa_bogwyrm`, `ffa_floateye`,
`ffa_frostmonk`, `ffa_grimjaw`, `ffa_jelly`, `ffa_malboro`, `ffa_tonberry`,
`ffa_toughskin`).

One unused rig is worth calling out: **`ffa_grave_hound`** was composed for this roster
(an undead quadruped hound) but no mob in `zones.ts` matches it. Grimshade Forest — the
obvious home — already has its four mobs, none of which is a hound. It is available if a
mob is ever added for it.

`ffa_skyguard` is excluded on structural grounds rather than taste: it is the one rig
that does not fit the 16-frame shape (18 frames, a 3-frame attack, and a 1-frame flinch
that is byte-identical to its idle pose), so a mob using it would appear not to react
when hit.
