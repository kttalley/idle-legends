// ── Duel resolver bundler ─────────────────────────────────────────────────────
//
// Emits an extension-qualified copy of the combat subtree into
// `supabase/functions/duel/_game/`, so the Edge Function can import the game's REAL
// `runFight` rather than a reimplementation that could drift from it.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// `supabase/functions/deno.json` enables `sloppy-imports`, which lets *Deno* resolve the
// game's extensionless relative imports (`./rng`). But deploying does not run Deno first:
// the Supabase API bundler walks the import graph itself, and it (a) cannot resolve
// extensionless specifiers and (b) only uploads files that live under the function's own
// directory — `../../../src/engine/fight` is outside it on both counts. A deploy without
// this step fails with:
//
//   Failed to bundle the function (reason: Module not found ".../source/src/engine/fight")
//
// So the fix is mechanical: copy the subtree inside the function directory and add the
// `.ts` extensions. The copy is regenerated on every deploy (see `npm run deploy:duel`),
// which is what keeps "one combat implementation" true — `_game/` is gitignored precisely
// so it can never be committed, go stale, and quietly become a second implementation.
//
// ── The guard ────────────────────────────────────────────────────────────────
// The subtree is portable today: no `import.meta`, no `window`, no `localStorage`. That is
// a property of the code, not a guarantee, and the failure mode if someone breaks it is a
// server-side 500 in a fight that already reported a winner. So this script refuses to
// emit a module carrying a browser or Vite global, and names the file and line.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(ROOT, 'src/engine/fight.ts')
const OUT = join(ROOT, 'supabase/functions/duel/_game')

/** Globals that exist in a browser or under Vite but not in Deno on the edge. */
const FORBIDDEN = [
  [/\bimport\.meta\b/, 'import.meta (Vite-only; Deno has no import.meta.env)'],
  [/\bwindow\./, 'window'],
  [/\bdocument\./, 'document'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bnavigator\./, 'navigator'],
]

// Matches the specifier in `from '…'`, bare `import '…'`, and `export * from '…'`.
const SPECIFIER = /(\bfrom\s*|^\s*import\s*|\bimport\s*\(\s*)(['"])(\.[^'"]+)\2/gm

/** An `import type` / `export type` statement — erased before anything runs. */
const TYPE_STATEMENT = /(?:^|\n)\s*(?:import|export)\s+type\s[^;]*?from\s*['"](\.[^'"]+)['"]/g

/** `./rng` → `./rng.ts`; anything already qualified is left alone. */
const qualify = spec => (/\.(ts|js|json|mjs)$/.test(spec) ? spec : `${spec}.ts`)

const read = file => readFileSync(file, 'utf8')
const deps = src => [...src.matchAll(SPECIFIER)].map(m => m[3])
const typeDeps = src => new Set([...src.matchAll(TYPE_STATEMENT)].map(m => m[1]))

// Two different questions, and conflating them is why the first run of this script failed
// on `engine/offline.ts`:
//
//   * What must be COPIED?  Everything the bundler might try to resolve — type imports
//     included, because resolution happens before erasure.
//   * What actually RUNS?   Only the value-import closure. `data/types.ts` type-imports
//     `engine/offline`, which touches `window`; that code is erased before it reaches
//     Deno, so guarding it would block a deploy over a line that can never execute.
//
// So: copy the full closure, guard only the value closure.
const copySet = new Map()
const valueSet = new Set()

function walkAll(file) {
  if (copySet.has(file)) return
  const src = read(file)
  copySet.set(file, src)
  for (const spec of deps(src)) walkAll(join(dirname(file), qualify(spec)))
}

function walkValue(file) {
  if (valueSet.has(file)) return
  valueSet.add(file)
  const src = read(file)

  for (const [re, name] of FORBIDDEN) {
    const line = src.split('\n').findIndex(l => re.test(l))
    if (line !== -1) {
      console.error(
        `\n  ${relative(ROOT, file)}:${line + 1} uses ${name}.\n\n` +
          `  This module RUNS in the duel resolver, in Deno on Supabase Edge Functions —\n` +
          `  there is no browser there. Either keep the global out of this subtree, or\n` +
          `  move the code that needs it above the fight layer.\n`,
      )
      process.exit(1)
    }
  }

  const erased = typeDeps(src)
  for (const spec of deps(src)) {
    if (erased.has(spec)) continue
    walkValue(join(dirname(file), qualify(spec)))
  }
}

walkValue(ENTRY)
walkAll(ENTRY)

rmSync(OUT, { recursive: true, force: true })

for (const [file, src] of copySet) {
  const rel = relative(join(ROOT, 'src'), file)
  const dest = join(OUT, rel)
  mkdirSync(dirname(dest), { recursive: true })

  const rewritten = src.replace(SPECIFIER, (_m, lead, quote, spec) => `${lead}${quote}${qualify(spec)}${quote}`)

  writeFileSync(
    dest,
    `// GENERATED by tools/bundleDuelResolver.mjs — do not edit.\n` +
      `// Source of truth: src/${rel.replace(/\\/g, '/')}\n` +
      rewritten,
  )
}

console.log(
  `bundled ${copySet.size} modules → ${relative(ROOT, OUT)}/ ` +
    `(${valueSet.size} of them execute; the rest are type-only)`,
)
