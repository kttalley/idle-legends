#!/usr/bin/env node
// ── Design-token guard ────────────────────────────────────────────────────────
//
//   node scripts/validate-design-tokens.mjs
//
// Two failure modes, both silent, both cheap to catch here and expensive to catch by eye:
//
//   1. `var(--typo)` renders as NOTHING. No console error, no build warning — the
//      property just does not apply, so text falls back to whatever it inherits and the
//      bug looks like a styling opinion rather than a mistake.
//   2. A chrome colour re-hardcoded as a hex literal. This is how the palette got into
//      the state that motivated the tokens: `#ffd700` sixty times, `#9d9d9d` twenty-four,
//      each one a copy of a copy. One reintroduced literal is invisible in review; a
//      hundred of them is a rewrite.
//
// Colour that is DATA is exempt (see ALLOW): sprite palettes, minimap terrain, the ASCII
// world map. Those are painted into a canvas, where `var()` does not resolve at all.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const CSS = join(ROOT, 'src/index.css')

// Colour as data, not as styling — these paint pixels, not chrome.
const ALLOW = new Set([
  'src/components/sprites/AvatarRenderer.tsx',
  'src/components/sprites/SpriteRenderer.tsx',
  'src/components/sprites/HeroAvatar.tsx',
  'src/components/game/CombatParticles.tsx',
  'src/components/game/WorldMapView.tsx',
])

// ── Why the logic layer is exempt ─────────────────────────────────────────────
// The store and engine emit colour strings with combat-log lines and floating numbers,
// and it is tempting to sweep those onto tokens too. It would be wrong, for two reasons
// that are both silent failures:
//
//   • Some of those strings reach a CANVAS. `ctx.fillStyle = 'var(--gold)'` does not
//     resolve — it paints transparent black, with no error anywhere.
//   • Some are compared for IDENTITY, not painted at all: combatAdapter dispatches VFX on
//     `fn.color === SHADOW_BOLT_COLOR`. Change one side of that equality and the spell
//     effect quietly stops firing while the number still shows up in the right colour.
//
// The real problem there is not the literals, it is that game logic is emitting
// presentation at all — CombatLog already has an EVENT_COLORS map keyed by event type, so
// the store's explicit colour is a redundant override. Fixing that means giving those
// events semantic kinds and letting the renderer choose the paint. That is a refactor of
// the store, not a find-and-replace, so it stays out of this check rather than being
// half-done by it.
const LOGIC_LAYER = /^src\/(store|engine|sim|data)\//

// Set per-element in JS (or by an animation), with a fallback at every use site. They are
// legitimately absent from :root — that is the point of them.
const RUNTIME_TOKENS = new Set(['--avatar-glow', '--seg'])

// The chrome palette. A literal from this list outside ALLOW means the sweep regressed.
const TOKENISED = {
  '#ffd700': '--gold',        '#ffe9a8': '--gold-bright',
  '#c8a864': '--gold-soft',   '#c8a100': '--gold-deep',
  '#f4c84a': '--gold-warm',   '#d4b896': '--parchment',
  '#9d9d9d': '--muted',       '#8a8070': '--muted-warm',
  '#1a1508': '--ink',         '#0a0805': '--ink-well',
  '#3a2c10': '--edge',        '#6b5020': '--edge-strong',
  '#6a5030': '--edge-soft',   '#4a3818': '--wood',
  '#6a5228': '--wood-lit',    '#ff4444': '--danger',
  '#ff8000': '--warn',        '#88ccaa': '--success',
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx|ts|css)$/.test(full)) out.push(full)
  }
  return out
}

const files = walk(join(ROOT, 'src'))
const defined = new Set(
  [...readFileSync(CSS, 'utf8').matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(m => m[1]),
)

const problems = []
const literalRe = new RegExp(`(${Object.keys(TOKENISED).join('|')})(?![0-9a-fA-F])`, 'gi')

for (const file of files) {
  const rel = relative(ROOT, file)
  const isData = ALLOW.has(rel) || rel.startsWith('src/render/') || LOGIC_LAYER.test(rel)
  const lines = readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\((--[a-z0-9-]+)\s*(,)?/g)) {
      const [, name, hasFallback] = m
      if (defined.has(name)) continue
      if (RUNTIME_TOKENS.has(name) && hasFallback) continue
      problems.push(RUNTIME_TOKENS.has(name)
        ? `${rel}:${i + 1}  ${name} is set at runtime and needs a fallback: var(${name}, …)`
        : `${rel}:${i + 1}  var(${name}) is not defined in index.css — renders as nothing`)
    }

    if (isData) return
    if (/^\s*--[a-z0-9-]+\s*:\s*#/.test(line)) return   // the definitions themselves
    for (const m of line.matchAll(literalRe)) {
      const hex = m[1].toLowerCase()
      problems.push(`${rel}:${i + 1}  hardcoded ${hex} — use var(${TOKENISED[hex]})`)
    }
  })
}

if (problems.length) {
  console.error(`design tokens: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`design tokens: ok — ${defined.size} defined, ${files.length} files clean`)
