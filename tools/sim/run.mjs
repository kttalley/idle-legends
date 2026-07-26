#!/usr/bin/env node
// ── Runner for the headless economy harness ───────────────────────────────────
//
// esbuild-bundles `src/sim/main.ts` (which pulls in the real game store) and runs
// it in Node with the two browser affordances the store actually touches:
// `localStorage` (save slots) and `import.meta.env` (Vite's build-time config).
//
//   node tools/sim/run.mjs --minutes 120 --advance
//
// Flags are forwarded to the bundle; see src/sim/main.ts.

import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// ── localStorage shim ─────────────────────────────────────────────────────────
// In-memory and per-process: the harness must never read or write a real save.
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
  setItem: (k, v) => { store.set(String(k), String(v)) },
  removeItem: k => { store.delete(String(k)) },
  clear: () => store.clear(),
  key: i => [...store.keys()][i] ?? null,
  get length() { return store.size },
}

// ── Seeded Math.random ────────────────────────────────────────────────────────
// The store rolls terrain, loot and combat off `Math.random`, so an unseeded run
// is unreproducible — useless for chasing an intermittent stall. Swapping in
// mulberry32 makes a whole scenario a pure function of its seed. Installed as a
// global so the scenario code can re-seed between runs in a sweep; the game code
// itself is untouched.
const realRandom = Math.random
globalThis.__setSeed = seed => {
  if (seed === null || seed === undefined) { Math.random = realRandom; return }
  let a = (seed >>> 0) || 0x9e3779b9
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const result = await build({
  entryPoints: [new URL('../../src/sim/main.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  write: false,
  logLevel: 'warning',
  define: {
    // Vite injects this at build time; the store reads BASE_URL and VITE_LLM_URL.
    // An empty VITE_LLM_URL keeps nameGen's `isLlmConfigured()` false, so the
    // harness never makes a network call.
    'import.meta.env': JSON.stringify({ BASE_URL: '/', VITE_LLM_URL: '', MODE: 'test', DEV: false, PROD: true }),
  },
})

const dir = await mkdtemp(join(tmpdir(), 'il-econ-'))
const bundlePath = join(dir, 'sim.mjs')
await writeFile(bundlePath, result.outputFiles[0].text)
await import(pathToFileURL(bundlePath).href)
