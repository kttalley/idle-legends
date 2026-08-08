// Entry point for the headless economy harness. Bundled and executed by
// `node tools/sim/run.mjs [--minutes N] [--advance] [--sell] [--step S] [--class C]`.

import {
  runScenario, runSweep, runInvariants, runSaveMigration, runOfflineParity, runLootFidelity, runManualAggro,
  formatReport, formatSweep, formatParity, MEAN_TOLERANCE,
  type ScenarioOpts, type Violation,
} from './econSim'
import type { ClassType } from '../data/types'

declare const process: { argv: string[]; stdout: { write(s: string): void } }

function argNum(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag)
  if (i < 0) return fallback
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) ? n : fallback
}

function argStr(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag)
  return i < 0 ? fallback : (process.argv[i + 1] ?? fallback)
}

const opts: ScenarioOpts = {
  minutes: argNum('--minutes', 30),
  stepSeconds: argNum('--step', 0.25),
  sampleEveryMinutes: argNum('--sample', 5),
  playerClass: argStr('--class', 'warrior') as ClassType,
  advanceZones: process.argv.includes('--advance'),
  sellCommons: process.argv.includes('--sell'),
  buyBagSlots: process.argv.includes('--buyslots'),
  buyContract: process.argv.includes('--contract'),
  buyUpgrades: process.argv.includes('--upgrades'),
  autoEquip: process.argv.includes('--equip'),
  disableAutoEquip: process.argv.includes('--noautoequip'),
  disableAutoAdvance: process.argv.includes('--noroam'),
  seed: process.argv.includes('--seed') ? argNum('--seed', 1) : null,
  spendTalents: process.argv.includes('--talents'),
}

const sweepCount = process.argv.includes('--sweep') ? argNum('--sweep', 20) : 0

if (process.argv.includes('--parity')) {
  const seeds = Array.from({ length: sweepCount || 8 }, (_, i) => i + 1)
  const tolerance = argNum('--tolerance', 0.35)
  const results = seeds.map(seed =>
    runOfflineParity(opts.minutes, seed, opts.stepSeconds, argNum('--warmup', 30),
      process.argv.includes('--settled')))
  process.stdout.write(formatParity(results, opts.minutes, tolerance) + '\n')
} else if (process.argv.includes('--assert')) {
  // Every scenario shape, across N seeds, checked every tick.
  const seeds = Array.from({ length: sweepCount || 10 }, (_, i) => i + 1)
  const shapes: { name: string; o: Partial<ScenarioOpts> }[] = [
    { name: 'idle',                o: {} },
    { name: 'idle+sell',           o: { sellCommons: true } },
    { name: 'idle+buy',            o: { buyBagSlots: true } },
    { name: 'advancing+sell+buy',  o: { advanceZones: true, sellCommons: true, buyBagSlots: true } },
    { name: 'contract',            o: { buyContract: true } },
    { name: 'contract+equip+all',  o: { advanceZones: true, buyBagSlots: true, buyContract: true, autoEquip: true } },
    { name: 'no-auto-equip',       o: { disableAutoEquip: true } },
    { name: 'buys-everything',     o: { buyBagSlots: true, buyContract: true, buyUpgrades: true, disableAutoAdvance: true } },
    // Party members deal real damage, so a partied hero is a different economy. Held to
    // the same invariants as a solo one — if a party can break loot, gold or levelling,
    // this is where it shows.
    { name: 'full party',          o: { partySize: 3 } },
    { name: 'full party+advance',  o: { partySize: 3, advanceZones: true, sellCommons: true } },
    // A TALENTED hero. Without this every talent-effect change lands green here, for the
    // same reason the fight golden was blind before C5 stage 0: no talent is ever taken.
    { name: 'talented',            o: { spendTalents: true } },
    { name: 'talented+party',      o: { spendTalents: true, partySize: 3 } },
  ]
  let failed = 0
  for (const shape of shapes) {
    const found: Violation[] = []
    for (const seed of seeds) found.push(...runInvariants({ ...opts, ...shape.o, seed }))
    if (found.length === 0) {
      process.stdout.write(`  ok    ${shape.name} — ${seeds.length} seeds × ${opts.minutes} min\n`)
    } else {
      failed++
      process.stdout.write(`  FAIL  ${shape.name}\n`)
      for (const v of found.slice(0, 8)) {
        process.stdout.write(`          [${v.rule}] at min ${v.minute.toFixed(1)}: ${v.detail}\n`)
      }
    }
  }
  // Offline parity is part of the standard check: it is the one claim that would be
  // invisible in normal play until players noticed idling paid worse than watching.
  // (a) Settled hero: exact parity is claimed and checked two-sided.
  const settled = seeds.map(seed => runOfflineParity(60, seed, opts.stepSeconds, 120, true))
  const settledErr = settled.reduce((a, r) => a + r.goldError, 0) / settled.length
  if (Math.abs(settledErr) <= MEAN_TOLERANCE) {
    process.stdout.write(`  ok    offline parity, settled hero — mean ${(settledErr * 100).toFixed(1)}%\n`)
  } else {
    failed++
    process.stdout.write(`  FAIL  offline parity, settled hero — mean ${(settledErr * 100).toFixed(1)}%, outside ±${Math.round(MEAN_TOLERANCE * 100)}%\n`)
  }
  // (b) Progressing hero: only the dangerous direction is forbidden. Idling must never
  //     out-earn playing, or closing the tab becomes the optimal strategy.
  const moving = seeds.map(seed => runOfflineParity(60, seed, opts.stepSeconds, 30, false))
  const movingErr = moving.reduce((a, r) => a + r.goldError, 0) / moving.length
  if (movingErr <= MEAN_TOLERANCE) {
    process.stdout.write(`  ok    offline never out-earns online — mean ${(movingErr * 100).toFixed(1)}% while progressing\n`)
  } else {
    failed++
    process.stdout.write(`  FAIL  offline OUT-EARNS online by ${(movingErr * 100).toFixed(1)}% — idling would beat playing\n`)
  }

  // Loot QUALITY, which every other gate here is blind to: they all count gold, kills
  // and levels, and none of them can see what a drop actually is.
  const loot = runLootFidelity()
  if (loot.length === 0) {
    process.stdout.write('  ok    loot fidelity — elites out-drop trash, offline matches online\n')
  } else {
    failed++
    process.stdout.write('  FAIL  loot fidelity\n')
    for (const v of loot) process.stdout.write(`          [${v.rule}] ${v.detail}\n`)
  }

  const manual = runManualAggro()
  if (manual.length === 0) {
    process.stdout.write("  ok    manual aggro — enemies attack a hero who has not engaged them\n")
  } else {
    failed++
    process.stdout.write("  FAIL  manual aggro\n")
    for (const v of manual) process.stdout.write(`          [${v.rule}] ${v.detail}\n`)
  }

  const migration = runSaveMigration()
  if (migration.length === 0) {
    process.stdout.write('  ok    save migration — round-trip, legacy blob, over-long array\n')
  } else {
    failed++
    process.stdout.write('  FAIL  save migration\n')
    for (const v of migration) process.stdout.write(`          [${v.rule}] ${v.detail}\n`)
  }
  process.stdout.write(failed === 0 ? '\nall invariants hold\n' : `\n${failed} shape(s) violated invariants\n`)
} else if (process.argv.includes('--combat-trace')) {
  // The STORE's golden. `fight.mjs` gates `engine/fight.ts` byte-for-byte; the store's own
  // combat path had no equivalent, so the only check on a refactor there was whether
  // aggregate gold looked about right — which cannot distinguish a faithful extraction from
  // one that quietly changed a formula. Prints an ordered combat log for fixed seeds;
  // `tools/sim/combat.mjs` diffs it against the committed baseline.
  //
  // Deliberately covers a TALENTED hero and a PARTY, because an untalented solo run
  // exercises one damage path and none of the procs — the trap the fight golden was in
  // before C5 stage 0.
  // Class variety matters more than duration here. A long warrior run produces thousands
  // of near-identical swing lines and still never fires a DoT tick, Creeping Freeze or
  // Seal Fate — the store-specific procs that stage 4 will lift are exactly what a golden
  // needs to hold still. One case per class, kept short, covers far more per line.
  const cases: { label: string; o: Partial<ScenarioOpts> }[] = [
    { label: 'warrior untalented', o: { playerClass: 'warrior' } },
    // Pinned builds, each chosen to fire a STORE-side proc that `fight.ts` does not have
    // and that stage 4 is going to lift. A levelling hero never reaches these in a short
    // trace — they sit at requiresPoints 20.
    { label: 'warrior procs',      o: { playerClass: 'warrior',
        forceTalents: { arms_sword_spec: 5, wbr_flurry: 3, arms_improved_rend: 2 } } },
    { label: 'warlock dots',       o: { playerClass: 'warlock',
        forceTalents: { aff_imp_corruption: 5, aff_imp_agony: 2, aff_nightfall: 2, bind_imp: 5 } } },
    { label: 'mage frost',         o: { playerClass: 'mage',
        forceTalents: { frost_frostbite: 3, frost_permafrost: 3 } } },
    { label: 'rogue seal fate',    o: { playerClass: 'rogue',
        forceTalents: { ass_seal_fate: 5, ass_vile_poisons: 4 } } },
    // Reaping Arc's periodic double-damage window. Added with the talent itself: no case
    // here reached `arms_sweeping_strikes`, so this golden matched byte-identically across
    // a change that took the talent from doing nothing to doubling five attacks a minute.
    { label: 'warrior reaping arc', o: { playerClass: 'warrior',
        forceTalents: { arms_deflection: 5, arms_tactical_mastery: 5, arms_deep_wounds: 3,
                        arms_two_handed: 5, arms_impale: 2, arms_sweeping_strikes: 1 } } },
    // The Whirling — Battle Cry's blow carrying to everything nearby. 30 points of
    // Ironcleave first, because that is what row 7 costs and a capstone allocated alone
    // is a build no player can hold.
    { label: 'warrior whirling', o: { playerClass: 'warrior', forceLevel: 20,
        forceTalents: { arms_heroic_strike: 3, arms_deflection: 5, arms_tactical_mastery: 5,
                        arms_deep_wounds: 3, arms_two_handed: 5, arms_impale: 2,
                        arms_sweeping_strikes: 1, arms_executioner: 3, arms_hamstring: 3,
                        arms_bladestorm: 1 } } },
    // The other three classes' AoE capstones. Added with the talents themselves: nothing
    // here reached row 7 in any tree, so this golden matched byte-identically across a
    // change that gave three classes a splash they did not have. Every build is legal —
    // 30 points in its own tree, and each capstone's `requires` node MAXED — because a
    // capstone allocated alone is a build no player can hold.
    { label: 'mage walking pyre', o: { playerClass: 'mage', forceLevel: 20,
        forceTalents: { emb_kindling: 5, emb_incineration: 2, emb_flame_throwing: 3,
                        emb_wildfire: 5, emb_master_of_flame: 3, emb_conflagrate: 3,
                        emb_cinderburst_mastery: 3, emb_immolation: 2, emb_searing_touch: 2,
                        emb_combustion: 2, emb_living_bomb: 3 } } },
    { label: 'warlock cinderpact', o: { playerClass: 'warlock', forceLevel: 20,
        forceTalents: { cin_improved_shadow_bolt: 4, cin_bane: 3, cin_devastation: 4,
                        cin_intensity: 3, cin_conflagrate: 5, cin_ruin: 3,
                        cin_bargain_mastery: 3, cin_emberstorm: 4, cin_soul_leech: 1,
                        cin_cinderpact: 1 } } },
    { label: 'rogue twin fangs', o: { playerClass: 'rogue', forceLevel: 20,
        forceTalents: { ass_improved_eviscerate: 3, ass_malice: 5, ass_ruthlessness: 3,
                        ass_slice_dice: 3, ass_expose_armor: 2, ass_improved_poisons: 4,
                        ass_cold_blood: 1, ass_venomous_wounds: 4, ass_seal_fate: 5,
                        ass_cruel_stroke_mastery: 3, ass_mutilate: 1 } } },
    { label: 'warrior + party',    o: { playerClass: 'warrior', spendTalents: true, partySize: 3 } },
  ]
  const out: string[] = [
    '# Idle Legends — STORE combat golden',
    '# Regenerate with: node tools/sim/combat.mjs --update',
    '# A diff here is a COMBAT BEHAVIOUR CHANGE in the store path. Read it before accepting.',
    '',
  ]
  for (const seed of [1, 2]) {
    for (const c of cases) {
      const r = runScenario({ ...opts, minutes: 10, seed, captureCombatTrace: true, ...c.o })
      out.push(`## ${c.label} | seed=${seed}`)
      out.push(...(r.combatTrace ?? []))
      out.push('')
    }
  }
  process.stdout.write(out.join('\n') + '\n')
} else if (process.argv.includes('--party-delta')) {
  // What a party is actually worth, in economy terms.
  //
  // Track C3's reversal made companions deal real damage, which raises kills per minute —
  // and until this mode existed the harness drove a solo hero only, so it reported "no
  // change" for a change it structurally could not see. That is the worst kind of green.
  // Same seeds on both sides so the comparison is like-for-like.
  const seeds = Array.from({ length: sweepCount || 8 }, (_, i) => i + 1)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  const run = (partySize: number) => {
    const gold: number[] = [], level: number[] = [], deaths: number[] = []
    for (const seed of seeds) {
      const r = runScenario({ ...opts, seed, partySize })
      gold.push(r.final.gold); level.push(r.final.level); deaths.push(r.final.deaths)
    }
    return { gold: mean(gold), level: mean(level), deaths: mean(deaths) }
  }
  const solo = run(0)
  const party = run(3)
  const pct = (a: number, b: number) =>
    `${b >= a ? '+' : ''}${(((b - a) / Math.max(1e-9, a)) * 100).toFixed(1)}%`
  const fmt = (n: number) => n.toFixed(n >= 100 ? 0 : 2).padStart(9)
  process.stdout.write(
    `── Party economy delta ───────────────────────────────────────────\n` +
    `${seeds.length} seeds × ${opts.minutes} min, identical seeds both sides\n\n` +
    `              solo    party(3)     delta\n` +
    `gold     ${fmt(solo.gold)}  ${fmt(party.gold)}   ${pct(solo.gold, party.gold)}\n` +
    `level    ${fmt(solo.level)}  ${fmt(party.level)}   ${pct(solo.level, party.level)}\n` +
    `deaths   ${fmt(solo.deaths)}  ${fmt(party.deaths)}   ${pct(solo.deaths, party.deaths)}\n`,
  )
} else if (sweepCount > 0) {
  const seeds = Array.from({ length: sweepCount }, (_, i) => i + 1)
  process.stdout.write(formatSweep(runSweep(opts, seeds), opts.minutes) + '\n')
} else {
  process.stdout.write(formatReport(runScenario(opts)) + '\n')
}
