// Entry point for the headless economy harness. Bundled and executed by
// `node tools/sim/run.mjs [--minutes N] [--advance] [--sell] [--step S] [--class C]`.

import { runScenario, runSweep, formatReport, formatSweep, type ScenarioOpts } from './econSim'
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
  seed: process.argv.includes('--seed') ? argNum('--seed', 1) : null,
}

const sweepCount = process.argv.includes('--sweep') ? argNum('--sweep', 20) : 0

if (sweepCount > 0) {
  const seeds = Array.from({ length: sweepCount }, (_, i) => i + 1)
  process.stdout.write(formatSweep(runSweep(opts, seeds), opts.minutes) + '\n')
} else {
  process.stdout.write(formatReport(runScenario(opts)) + '\n')
}
