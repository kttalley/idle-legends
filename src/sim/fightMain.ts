// Entry point for the fight-determinism harness.
// Bundled and executed by `node tools/sim/fight.mjs [--seeds N]`.

import {
  checkDeterminism, checkSeedSensitivity, compareGolden, formatDeterminismReport,
  formatGolden, formatGoldenReport, GOLDEN_SEEDS, makeMob, makeRoster, standardCases,
} from './fightSim'
import { runFight } from '../engine/fight'

declare const process: { argv: string[]; stdout: { write(s: string): void }; exit(c: number): void }

// File I/O lives in the runner, not here: `src/` is typechecked by the app's `tsc` and
// there is no `@types/node`, so importing `node:fs` would break `npm run build`. The
// runner hands the committed baseline in and takes the fresh text back out through
// globals, and owns the exit code.
const g = globalThis as unknown as {
  __IL_GOLDEN_EXPECTED?: string | null
  __IL_GOLDEN_MODE?: 'check' | 'update'
  __IL_RESULT?: { ok: boolean; goldenText: string }
}

function argNum(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag)
  if (i < 0) return fallback
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) ? n : fallback
}

const seedCount = argNum('--seeds', 6)
const seeds = Array.from({ length: seedCount }, (_, i) => 1000 + i * 7717)

const reports = standardCases(seeds).map(checkDeterminism)
process.stdout.write(formatDeterminismReport(reports) + '\n')

// Counter-test: distinct seeds must diverge, or "deterministic" only means "frozen".
// Run it on the DUEL, not on a hero-vs-mob fight: two heroes trading blows for ~40
// events is roll-dense enough that a collision genuinely indicates a stuck stream,
// whereas a short mob kill has too few rolls to distinguish seeds reliably.
const sens = checkSeedSensitivity(
  seed => runFight(
    seed,
    makeRoster(11, 'warrior', 40, 'Concord'),
    makeRoster(22, 'mage', 40, 'Ashmarch'),
  ),
  Array.from({ length: 32 }, (_, i) => i + 1),
)
process.stdout.write(
  `\n── Seed sensitivity ──────────────────────────────────────────────\n` +
  `distinct logs: ${sens.distinct}/${sens.total} (${(sens.ratio * 100).toFixed(0)}%, need 90%)\n` +
  sens.collisions.map(c => `  ${c}\n`).join(''),
)

// ── Golden log ────────────────────────────────────────────────────────────────
// The third leg, and the only one that can catch a behaviour change. The two above
// compare the resolver against itself; this compares it against what was committed.
const goldenText = formatGolden(standardCases(GOLDEN_SEEDS))
const mode = g.__IL_GOLDEN_MODE ?? 'check'
const golden = compareGolden(g.__IL_GOLDEN_EXPECTED ?? null, goldenText)

if (mode === 'update') {
  process.stdout.write(
    `\n── Golden log ────────────────────────────────────────────────────\n` +
    `writing baseline: ${goldenText.split('\n').length} lines\n`,
  )
} else {
  process.stdout.write('\n' + formatGoldenReport(golden) + '\n')
}

const desyncs = reports.filter(r => !r.identical).length
const frozen = !sens.pass
// A missing baseline is not a failure — it is the state on the very first run, and the
// runner writes one. A CHANGED baseline is a failure, loudly.
const goldenOk = mode === 'update' || golden.matched || golden.missing
const ok = desyncs === 0 && !frozen && goldenOk

process.stdout.write(
  `\n${ok ? 'PASS' : 'FAIL'} — ` +
  `${desyncs} desync(s), ${frozen ? 'seed-insensitive (logs collide)' : 'seed-sensitive'}` +
  `, golden ${mode === 'update' ? 'rewritten' : golden.missing ? 'absent' : golden.matched ? 'matched' : 'CHANGED'}\n`,
)

g.__IL_RESULT = { ok, goldenText }
