// ── Sound effects actually play, and the Sound effects switch actually stops them ─────
//
// Reads `window.__sfx` (DEV-only, src/engine/audio/sfx.ts): which cues decoded and which
// cues were started. The audio itself can't be heard from here, but "a hit played a hit
// sound" and "turning effects off stopped them" can be checked.
//
// Audio only unlocks on a real user gesture, and the harness's `clickByText` is a
// synthetic element.click() the browser doesn't count as one — so this suite sends a real
// CDP tap to latch the AudioContext, exactly like a player's first touch.

import { enterGame, evaluate, sleep, tap, waitFor } from '../cdp.mjs'

export const name = 'sfx'
export const device = { width: 1280, height: 800, scale: 1 }

const COMBAT = /^(hit_|cast_|impact_|hurt|shadow_bolt|ally_hit|splash|dot_tick)/

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })
  await tap(send, 640, 400)

  const loaded = await waitFor(send, `(window.__sfx?.loaded.length ?? 0) > 0`, { timeout: 15000 })
  const cues = await evaluate(send, `window.__sfx?.loaded ?? []`)
  check('the effects manifest loads and decodes', loaded && cues.length >= 25, `${cues.length} cues`)

  // An untouched level-1 hero walks to the nearest mob and starts swinging within seconds.
  await waitFor(send, `window.__sfx.played.some(c => ${COMBAT}.test(c))`, { timeout: 30000 })
  await sleep(8000)
  const played = await evaluate(send, `window.__sfx.played.slice()`)
  const tally = {}
  for (const c of played) tally[c] = (tally[c] ?? 0) + 1
  note(`played in ~10s of combat: ${JSON.stringify(tally)}`)
  check('combat makes combat sounds', played.some(c => COMBAT.test(c)))
  check('a kill makes a kill sound', played.includes('mob_death') || played.includes('boss_death'))
  check('every played cue is one that loaded', played.every(c => cues.includes(c)))

  // The switch: Menu → Settings → Sound effects Off, then nothing more should play.
  await evaluate(send, `document.querySelector('[aria-label="Menu — character select"]')?.click()`)
  await sleep(400)
  // Not clickByText(/^Settings$/): the row's text includes its caption.
  await evaluate(send, `[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Settings'))?.click()`)
  await sleep(400)
  const toggled = await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Sound effects'));
    if (!b) return null; b.click(); return b.textContent;
  })()`)
  await sleep(300)
  const after = await evaluate(send, `[...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Sound effects'))?.textContent ?? null`)
  check('the menu offers a Sound effects switch', toggled !== null, after ?? '')
  check('...which reads Off once pressed', /Off$/.test(after ?? ''))
  // The menu is modal over the world, but the world keeps fighting underneath it.
  const before = await evaluate(send, `window.__sfx.played.length`)
  await sleep(6000)
  const later = await evaluate(send, `window.__sfx.played.length`)
  check('with effects off, nothing more plays', later === before, `${later - before} played`)
}
