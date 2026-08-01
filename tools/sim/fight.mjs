#!/usr/bin/env node
// ── Runner for the fight-determinism harness ──────────────────────────────────
//
// esbuild-bundles `src/sim/fightMain.ts` and runs it in Node.
//
//   node tools/sim/fight.mjs --seeds 6
//
// Unlike `run.mjs`, this runner deliberately does NOT install a seeded global
// `Math.random`. That swap is the right tool for reproducing an economy run, but here it
// would make the test pass for the wrong reason: the claim under test is that a fight is
// deterministic because the seed is threaded through `AttackContext`, not because the
// whole process was pinned. If a `Math.random` leaks back into the combat path, this
// harness must fail — and with a global swap installed, it wouldn't.
//
// Exit code is 0 on PASS, 1 on any desync, seed-insensitivity, or golden-log change, so
// it can gate CI.
//
// ── The golden log ────────────────────────────────────────────────────────────
// `tools/sim/golden/fight-golden.txt` is a committed byte-exact record of what the
// resolver produces. The in-process determinism check compares each fight against its own
// re-run, which cannot notice that the fight itself changed — so a refactor that reorders
// RNG draws (going N-sided, for one) keeps it green while silently altering every result.
// This runner holds the baseline because `src/` has no `@types/node` and importing
// `node:fs` there would break `npm run build`.
//
//   node tools/sim/fight.mjs                  # check against the baseline
//   node tools/sim/fight.mjs --update-golden  # rewrite it, then read the diff

import { build } from 'esbuild'
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const result = await build({
  entryPoints: [new URL('../../src/sim/fightMain.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  write: false,
  logLevel: 'warning',
  define: {
    'import.meta.env': JSON.stringify({ BASE_URL: '/', VITE_LLM_URL: '', MODE: 'test', DEV: false, PROD: true }),
  },
})

const GOLDEN_PATH = join(
  dirname(fileURLToPath(import.meta.url)), 'golden', 'fight-golden.txt',
)
const updating = process.argv.includes('--update-golden')

// A missing baseline reads as null, which the harness reports as "absent" rather than as
// a failure — the first run on a fresh clone should not fail, it should record.
let expected = null
try {
  expected = await readFile(GOLDEN_PATH, 'utf8')
} catch (err) {
  if (err.code !== 'ENOENT') throw err
}

globalThis.__IL_GOLDEN_EXPECTED = expected
globalThis.__IL_GOLDEN_MODE = updating ? 'update' : 'check'

const dir = await mkdtemp(join(tmpdir(), 'il-fight-'))
const bundlePath = join(dir, 'fight.mjs')
await writeFile(bundlePath, result.outputFiles[0].text)
await import(pathToFileURL(bundlePath).href)

const outcome = globalThis.__IL_RESULT
if (!outcome) {
  process.stdout.write('\nFAIL — harness produced no result\n')
  process.exit(1)
}

if (updating || expected === null) {
  await mkdir(dirname(GOLDEN_PATH), { recursive: true })
  await writeFile(GOLDEN_PATH, outcome.goldenText)
  process.stdout.write(`golden baseline written: ${GOLDEN_PATH}\n`)
}

process.exit(outcome.ok ? 0 : 1)
