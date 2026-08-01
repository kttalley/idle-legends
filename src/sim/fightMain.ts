// Entry point for the fight-determinism harness.
// Bundled and executed by `node tools/sim/fight.mjs [--seeds N]`.

import {
  checkDeterminism, checkSeedSensitivity, formatDeterminismReport, makeMob, makeRoster,
  standardCases,
} from './fightSim'
import { runFight } from '../engine/fight'

declare const process: { argv: string[]; stdout: { write(s: string): void }; exit(c: number): void }

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

const desyncs = reports.filter(r => !r.identical).length
const frozen = !sens.pass
process.stdout.write(
  `\n${desyncs === 0 && !frozen ? 'PASS' : 'FAIL'} — ` +
  `${desyncs} desync(s), ${frozen ? 'seed-insensitive (logs collide)' : 'seed-sensitive'}\n`,
)
process.exit(desyncs === 0 && !frozen ? 0 : 1)
