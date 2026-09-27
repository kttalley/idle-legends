// ── Store-shot fixtures: one hero state per screenshot ───────────────────────
//
// Shared by shoot-store.mjs and shoot-ipad.mjs so the two sets cannot drift apart. They
// did before: the iPad set was shot two weeks after the iPhone set, from a copy of the
// same seed literal, and nothing would have noticed if only one of them had been updated.
//
// Two rules these fixtures exist to enforce:
//
//   • EVERY in-world shot lands in a DIFFERENT biome. Every previous shot was taken in
//     `grimshade_forest`, so the whole set was the same purple gloom and the store page
//     read as a one-tileset game. `src/render/adapter/mapAdapter.ts` maps zone → biome
//     palette; the zones picked below resolve to jungle / ashfire / bloodfields, which are
//     the three furthest apart in hue and value of the twelve.
//   • The state is REACHABLE. `canEnterZone` (src/engine/zoneProgression.ts) wants
//     `level >= zone.levelRange[0]` and the previous zone's boss dead, so each seed carries
//     the whole prerequisite chain rather than teleporting a level-1 hero into the endgame.
//     A shot of a state the game cannot produce is a mocked screenshot with extra steps.

// Mirrors ZONE_ORDER in src/data/zones.ts. Duplicated because these tools are plain .mjs
// and cannot import the TypeScript source — `assertSeeded` below re-reads the zone back
// out of the live store after every seed, so a drift here fails the run instead of
// silently shooting the wrong place.
export const ZONE_ORDER = [
  'sunhollow_meadows',
  'dustwind_plains',
  'grimshade_forest',
  'thornvale_jungle',
  'ashfire_peaks',
  'shattered_crossing',
  'the_bloodfields',
  'ironcrag_badlands',
  'venom_hollows',
  'warsong_mesa',
  'cinderfall_wastes',
  'the_maw_eternal',
]

// `ZoneConfig.unlockKills` per zone — the objective tracker's denominator. Only the zones
// the seeds below actually visit need an entry.
const UNLOCK_KILLS = {
  sunhollow_meadows: 35,
  dustwind_plains: 52,
  grimshade_forest: 70,
  thornvale_jungle: 88,
  ashfire_peaks: 105,
  shattered_crossing: 110,
  the_bloodfields: 115,
}

const RARITY_MULT = { common: 1.0, uncommon: 1.5, rare: 2.2, epic: 3.5, legendary: 6.0 }
const VENDOR_MULT = { common: 1, uncommon: 3, rare: 8, epic: 25, legendary: 100 }

/**
 * A worn set that matches the hero's level.
 *
 * Without this the seeded hero wears the level-1 starting kit at level 55: the character
 * sheet then reads "Weapon DPS 11.1 / Armor 30" next to a zone whose mobs have four
 * figures of health, which is the sort of internal contradiction a reviewer notices even
 * when they cannot say why the picture looks wrong.
 *
 * Stat shape, rarity multipliers, stat counts and names are all lifted from `generateItem`
 * and the `PREFIX`/`SLOT_NAMES` tables in src/data/items.ts, with the random rolls fixed at
 * the middle of their ranges — so these are items the drop system could have produced, not
 * invented numbers. Deterministic on purpose: the point of seeding is that two runs of the
 * shooter produce the same picture.
 */
export function gearFor(level) {
  const base = level * 0.5 + 1
  const mk = (slot, rarity, name, statBonuses) => ({
    id: `seed_${slot}`,
    name,
    slot,
    rarity,
    level,
    statBonuses,
    vendorValue: Math.round(level * VENDOR_MULT[rarity]),
    spriteKey: `item_${slot}`,
  })
  // generateItem rolls each stat in a band around `base`; these take the midpoint.
  const dps = r => Math.round(base * 1.05 * RARITY_MULT[r])
  const arm = r => Math.round(base * 1.30 * RARITY_MULT[r])
  const st  = r => Math.round(base * 0.80 * RARITY_MULT[r])

  return {
    weapon: mk('weapon', 'epic', 'Dreadwrought Blade', {
      weaponDps: dps('epic'), strength: st('epic'), agility: st('epic'), critChance: 0.07,
    }),
    helm: mk('helm', 'rare', 'Ironveil Coif', {
      stamina: st('rare'), armor: arm('rare'), strength: st('rare'),
    }),
    chest: mk('chest', 'epic', 'Voidtouched Breastplate', {
      stamina: st('epic'), armor: arm('epic'), strength: st('epic'), agility: st('epic'),
    }),
    legs: mk('legs', 'rare', 'Gleaming Greaves', {
      stamina: st('rare'), armor: arm('rare'), agility: st('rare'),
    }),
    boots: mk('boots', 'uncommon', 'Reinforced Sabatons', {
      agility: st('uncommon'), stamina: st('uncommon'),
    }),
    trinket: mk('trinket', 'rare', 'Shadowforged Talisman', {
      critChance: 0.044, goldFindBonus: 1.22, stamina: st('rare'),
    }),
  }
}

/**
 * A full save patch for `seedSave`: standing in `zoneId` at `level`, part-way through that
 * zone's clear quest, with every earlier zone unlocked and every earlier boss down.
 *
 * `progress` is how far through the kill objective to be (0..1). Deliberately not 0 and not
 * 1: at 0 the tracker's progress bar is an empty trough, and at 1 the tracker hides itself
 * (ObjectiveTracker returns null once `isZoneQuestComplete`), which would quietly remove
 * the very thing 02's caption promises.
 */
export function seedFor(zoneId, level, { gold, progress = 0.4 } = {}) {
  const idx = ZONE_ORDER.indexOf(zoneId)
  if (idx < 0) throw new Error(`unknown zone ${zoneId} — is it still in ZONE_ORDER?`)

  const unlockedZones = ZONE_ORDER.slice(0, idx + 1)
  const bossesDefeated = ZONE_ORDER.slice(0, idx)   // everything behind you is cleared

  const totalZoneKills = {}
  for (const z of bossesDefeated) totalZoneKills[z] = (UNLOCK_KILLS[z] ?? 60) + 8
  totalZoneKills[zoneId] = Math.round((UNLOCK_KILLS[zoneId] ?? 80) * progress)

  return {
    level,
    gold: gold ?? level * 400,
    equipment: gearFor(level),
    currentZone: zoneId,
    unlockedZones,
    bossesDefeated,
    totalZoneKills,
  }
}

// ── The three in-world fixtures ──────────────────────────────────────────────
// Zone → biome palette (mapAdapter.ts BIOME_PALETTE) is given for each, because the whole
// reason these three zones were chosen over any others is the palette they resolve to.
export const SHOT_SEEDS = {
  // biome/jungle — deep saturated green, heavy canopy scatter. The most "look at the
  // world" of the twelve, and the furthest thing from the purple gloom every prior shot used.
  world: { zone: 'thornvale_jungle', level: 34, gold: 15200 },
  // biome/ashfire — charcoal ground with ember accents. Reads as danger without any UI
  // saying so, which is what a combat frame wants.
  combat: { zone: 'ashfire_peaks', level: 46, gold: 26800 },
  // biome/bloodfields — red earth and blood-dark water. The character sheet leaves a strip
  // of world down the right edge; this makes that strip a third distinct colour, and level
  // 55 gives the sheet a zone track with real progress on it.
  sheet: { zone: 'the_bloodfields', level: 55, gold: 41000 },
  // Crossroads Market — the busiest town, and the frame that says MMO: a dozen named
  // characters, service NPCs and stalls. Entered through the zone's own "Visit town"
  // control after seeding, never by writing gameMode into the save.
  town: { zone: 'shattered_crossing', level: 48, gold: 30000 },
}

/**
 * Re-read the live store and confirm the seed actually took.
 *
 * `seedSave` patches localStorage and reloads, and `rehydrateState` is free to reject or
 * rewrite what it finds — an unreachable zone, a level below the zone's floor, a shape it
 * does not recognise. Without this check the shooter would keep writing perfectly valid
 * PNGs of the wrong zone, which is precisely the class of staleness that put the same
 * forest in all five of the last set. `window.__ilState` is published by
 * DimetricWorldScene under `import.meta.env.DEV`, so it exists on the dev server the
 * shooter runs against.
 */
export function assertSeededExpr(zoneId, level) {
  return `(() => {
    const s = window.__ilState && window.__ilState();
    if (!s) return 'no __ilState — is this a dev build?';
    if (s.currentZone !== ${JSON.stringify(zoneId)}) return 'zone is ' + s.currentZone;
    if (s.level !== ${level}) return 'level is ' + s.level;
    return null;
  })()`
}

/**
 * Is the crowd in this frame worth photographing?
 *
 * The 2026-09-05 set was multi-biome but still wrong in two ways a still frame makes
 * obvious. The world shot caught three other heroes' nameplates stacked on each other and
 * a fourth half-buried under the hero card ("Sy… the Haunted Hollow"), plus two stray damage
 * numbers under the same card — it read as a rendering bug. And the combat shot had nobody
 * in it but the hero, which is the one picture an MMO listing cannot afford. Both were pure
 * timing: the crowd is always there, the shooter just took the first frame that satisfied
 * a predicate that never looked at it.
 *
 * So the frame must have at least `min` other heroes whose nameplates sit in open world —
 * inside the viewport, clear of every HUD surface — and no lit damage number under a HUD
 * surface. Plates stacking on each other was a renderer bug, fixed there
 * (src/render/labelLayout.ts), so this no longer has to dodge it. Nameplates are canvas-drawn, so their boxes are
 * estimated from the hero anchor that `ambientScreenPositions()` reports (buffer space,
 * mapped to CSS through the world canvas's rect); the estimate is deliberately generous.
 */
export function crowdOkExpr(min) {
  return `(() => {
    const sc = window.__ilScene;
    if (!sc || !sc.ambientScreenPositions) return false;
    const cv = [...document.querySelectorAll('canvas')]
      .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (!cv || !sc.cam || !sc.cam.w) return false;
    const cr = cv.getBoundingClientRect();
    const k = cr.width / sc.cam.w;
    const hud = ['.unit-frames', '.objective-tracker', '.app-dock', '.actionbar-shell',
                 '.minimap-disc', '.minimap-caption', '.app-modepanel',
                 // The iPad layout keeps both rails open; a hero under one is not in view.
                 '.app-sidebar-left', '.app-sidebar-right', '.combat-log']
      .flatMap(s => [...document.querySelectorAll(s)])
      .map(e => e.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0);
    const hit = (a, b, pad = 6) => a.left < b.right + pad && a.right > b.left - pad
                                && a.top < b.bottom + pad && a.bottom > b.top - pad;
    const plates = sc.ambientScreenPositions().map(h => {
      const x = cr.left + h.sx * k, y = cr.top + h.sy * k;
      const w = Math.max(60, h.name.length * 13);
      // The plate floats above the sprite; the box spans plate AND body so a hero half
      // under a card is rejected, not just one whose label is.
      return { name: h.name, left: x - w / 2, right: x + w / 2, top: y - 110, bottom: y + 4 };  // plate ~61px over the feet, plus two declutter rows
    });
    const clear = plates.filter(p => p.left >= 4 && p.right <= innerWidth - 4 && p.top >= 4
      && p.bottom <= innerHeight - 4 && !hud.some(r => hit(p, r)));
    if (clear.length < ${min}) return false;
    // A plate the canvas drew UNDER a HUD card is worse than no plate: the 2026-09-27
    // combat run caught "Sylgar the Haunted" half-buried under the unit frames. The canvas
    // cannot see the DOM, so the frame has to be picked instead. Only plates actually on
    // screen count — one just past the edge is invisible either way.
    const onScreen = plates.filter(p => p.right > 0 && p.left < innerWidth && p.bottom > 0 && p.top < innerHeight);
    if (onScreen.some(p => hud.some(r => hit({ ...p, bottom: p.top + 66 }, r, 0)))) return false;
    // A lit damage number under a HUD card, or printed across a name ("50" over "Fenna").
    const buried = [...document.querySelectorAll('.il-floater')].some(el => {
      if (parseFloat(getComputedStyle(el).opacity) <= 0.05) return false;
      const r = el.getBoundingClientRect();
      return hud.some(h => hit(r, h, 0)) || onScreen.some(p => hit(r, { ...p, bottom: p.top + 66 }, 0));
    });
    return !buried;
  })()`
}
