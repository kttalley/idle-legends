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
// Exit code is 0 on PASS, 1 on any desync or seed-insensitivity, so it can gate CI.

import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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

const dir = await mkdtemp(join(tmpdir(), 'il-fight-'))
const bundlePath = join(dir, 'fight.mjs')
await writeFile(bundlePath, result.outputFiles[0].text)
await import(pathToFileURL(bundlePath).href)
