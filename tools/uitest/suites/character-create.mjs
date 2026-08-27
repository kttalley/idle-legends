import { clickByText, evaluate, waitFor, sleep } from '../cdp.mjs'

// The first real decision the game asks for.
//
// Classes were picked from a name and a colour swatch: `ClassDefinition.description` had
// existed since the classes were written and was rendered nowhere. Same shape of bug as
// the objective tracker — the data was there the whole time, the UI never asked for it.

export const name = 'character-create'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

const CLASSES = ['Warrior', 'Mage', 'Rogue', 'Warlock']

export async function run({ send, appUrl, check, note }) {
  // Not `enterGame` — this suite needs the create screen, which is the thing enterGame
  // clicks past. Reach it the same way a first-time player does: an empty origin.
  await send('Emulation.setDeviceMetricsOverride', {
    width: device.width, height: device.height, deviceScaleFactor: device.scale, mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Page.navigate', { url: appUrl })
  await waitFor(send, `document.readyState === 'complete'`)
  await evaluate(send, `(() => new Promise(r => {
    try { localStorage.clear() } catch {}
    if (typeof indexedDB === 'undefined') return r(1);
    const q = indexedDB.deleteDatabase('idle_legends');
    q.onsuccess = q.onerror = q.onblocked = () => r(1);
    setTimeout(() => r(1), 2000);
  }))()`)
  await send('Page.navigate', { url: appUrl })

  // The terms gate (App Review 1.2) stands ahead of character create on a cold origin, and
  // clearing localStorage above clears its acceptance too. A first-time player agrees and
  // then lands here; so does this suite.
  await waitFor(send, `document.readyState === 'complete'`)
  await waitFor(send, `!!document.querySelector('[aria-label="Terms of Use"]')`, { timeout: 15000 })
  await evaluate(send, clickByText('/^I agree$/i'))

  const reached = await waitFor(send, `!!document.querySelector('.create-class-blurb')`, { timeout: 25000 })
  check('a first-time player lands on character create with a class blurb', reached)
  if (!reached) return

  // ── Every class explains itself ────────────────────────────────────────────
  const seen = []
  for (const cls of CLASSES) {
    const clicked = await evaluate(send, `(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(cls)});
      if (!b) return false; b.click(); return true;
    })()`)
    if (!clicked) { check(`${cls} is offered`, false); continue }
    await sleep(350)
    const text = await evaluate(send, `document.querySelector('.create-class-blurb p')?.textContent ?? ''`)
    const stat = await evaluate(send, `document.querySelector('.create-class-stat')?.textContent ?? ''`)
    seen.push({ cls, text, stat })
    check(`${cls} has a description`, text.length > 40)
    check(`${cls} names its primary stat`, /strength|intellect|agility/i.test(stat))
  }
  note(seen.map(s => `${s.cls}: ${s.text.slice(0, 52)}…`).join('\n  · '))

  // ── The descriptions are distinct, not one string for all four ─────────────
  check('each class reads differently', new Set(seen.map(s => s.text)).size === seen.length)

  // ── No development status leaks into player-facing copy ────────────────────
  // Two of these blurbs were written while the talent trees were half-built and still
  // said so — "the only class whose three paths are fully forged" is a note-to-self, and
  // by the time all twelve trees existed it was also simply false.
  const leaks = seen.filter(s => /fully forged|not yet|coming soon|TODO|WIP|spec:/i.test(s.text))
  check('no build-status notes are shown to the player',
    leaks.length === 0, leaks.map(l => `${l.cls}: ${l.text}`)[0])

  // ── Switching class must not make the form jump ────────────────────────────
  // The blurb box is fixed-height for this reason; without it the Race and Faction rows
  // shift under the thumb as you compare classes.
  const heights = []
  for (const cls of CLASSES) {
    await evaluate(send, `[...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(cls)})?.click()`)
    await sleep(250)
    heights.push(await evaluate(send, `Math.round(document.querySelector('.create-class-blurb').getBoundingClientRect().height)`))
  }
  note(`blurb heights across classes: ${heights.join(', ')}px`)
  check('the blurb box does not resize between classes',
    Math.max(...heights) - Math.min(...heights) <= 1)
}
