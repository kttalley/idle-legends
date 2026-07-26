// Entry point for the headless economy harness. Bundled and executed by
// `node tools/sim/run.mjs [--minutes N] [--advance] [--sell] [--step S] [--class C]`.

import {
  runScenario, runSweep, runInvariants, runSaveMigration, runOfflineParity,
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
  autoEquip: process.argv.includes('--equip'),
  disableAutoEquip: process.argv.includes('--noautoequip'),
  seed: process.argv.includes('--seed') ? argNum('--seed', 1) : null,
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

  const migration = runSaveMigration()
  if (migration.length === 0) {
    process.stdout.write('  ok    save migration — round-trip, legacy blob, over-long array\n')
  } else {
    failed++
    process.stdout.write('  FAIL  save migration\n')
    for (const v of migration) process.stdout.write(`          [${v.rule}] ${v.detail}\n`)
  }
  process.stdout.write(failed === 0 ? '\nall invariants hold\n' : `\n${failed} shape(s) violated invariants\n`)
} else if (sweepCount > 0) {
  const seeds = Array.from({ length: sweepCount }, (_, i) => i + 1)
  process.stdout.write(formatSweep(runSweep(opts, seeds), opts.minutes) + '\n')
} else {
  process.stdout.write(formatReport(runScenario(opts)) + '\n')
}
