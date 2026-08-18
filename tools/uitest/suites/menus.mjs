import { evaluate, enterGame, pressKey, seedSave, sleep, waitFor } from '../cdp.mjs'

// The rule of menus, asserted.
//
// Every case here is a bug that shipped or nearly shipped, and none of them is visible to
// the type checker or to a diff. The nested-Escape case in particular only reproduces
// with two surfaces open at once, which on a phone is the ordinary state of the world.

export const name = 'menus'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

const clickText = pattern => `(() => {
  const b = [...document.querySelectorAll('button')].find(x => ${pattern}.test(x.textContent || ''));
  if (!b) return null; b.click(); return b.textContent.trim();
})()`

// Idempotent: the dock button TOGGLES, so blind-clicking it to "open" the drawer closes
// it whenever a previous step left it up. Several assertions here read the DOM, and the
// drawer stays mounted while it is transformed off-screen — so a stale toggle produces
// checks that look reasonable and mean nothing.
const ensureDock = (label, openSelector) => `(() => {
  if (document.querySelector(${JSON.stringify(openSelector)})) return 'already';
  const b = [...document.querySelectorAll('.app-dock-btn')].find(x => /${label}/i.test(x.textContent));
  if (!b) return 'missing'; b.click(); return 'clicked';
})()`
// The dock button is captioned 'Menu' now (it opens the menu rail); it was 'Hero'.
const ensureHeroDrawer = ensureDock('Menu', '.app-sidebar-left.panel-open')

/** A real press at a viewport point, for exercising outside-dismissal. */
const pressAt = (x, y) => `(() => {
  const el = document.elementFromPoint(${x}, ${y});
  (el ?? document.body).dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, clientX: ${x}, clientY: ${y},
  }));
  return el?.className || el?.tagName || 'none';
})()`

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })
  // A fresh hero stands in zone one of twelve with nothing unlocked, so there is no
  // destination to fast-travel to. Wind the save forward far enough that the zone
  // assertions have something to act on.
  await seedSave(send, appUrl, {
    level: 22,
    gold: 4200,
    currentZone: 'grimshade_forest',
    unlockedZones: ['sunhollow_meadows', 'dustwind_plains', 'grimshade_forest', 'thornvale_jungle'],
    bossesDefeated: ['sunhollow_meadows', 'dustwind_plains'],
    totalZoneKills: { sunhollow_meadows: 51, dustwind_plains: 60, grimshade_forest: 18 },
  })

  const drawerOpen  = () => evaluate(send, `!!document.querySelector('.app-sidebar-left.panel-open')`)
  const wardrobeUp  = () => evaluate(send, `!!document.querySelector('[data-surface="wardrobe"]')`)
  const mapUp       = () => evaluate(send, `!!document.querySelector('.zone-track-modal')`)

  // ── Escape peels ONE layer, innermost first ────────────────────────────────
  // The failure this replaces: two independent window listeners both fired, the outer
  // one (the drawer) ran first, and re-rendering its subtree removed the wardrobe's
  // listener mid-dispatch — so Escape closed the drawer UNDERNEATH and left the modal
  // sitting on top of nothing.
  await evaluate(send, ensureHeroDrawer)
  await sleep(700)
  check('hero drawer opens', await drawerOpen())

  await evaluate(send, clickText('/^Looks$/i'))
  await sleep(800)
  check('wardrobe opens over the drawer', await wardrobeUp())

  await pressKey(send, 'Escape')
  check('Escape closes the wardrobe, not the drawer under it', !await wardrobeUp())
  check('...and the drawer is still open', await drawerOpen())

  await pressKey(send, 'Escape')
  check('a second Escape closes the drawer', !await drawerOpen())

  // ── Completing the action dismisses the surface ────────────────────────────
  await evaluate(send, ensureHeroDrawer)
  await sleep(600)
  await evaluate(send, clickText('/^Looks$/i'))
  // Wait for the TILES, not a fixed beat. Each one is a live HeroAvatar that paints on a
  // canvas after its sprite sheet resolves, and on a cold profile that lands well after
  // any sleep worth writing — which reads as "no colourway available" rather than "slow".
  await waitFor(send, `document.querySelectorAll('[data-surface="wardrobe"] button canvas').length > 1`)
  const picked = await evaluate(send, `(() => {
    const root = document.querySelector('[data-surface="wardrobe"]');
    if (!root) return null;
    const tile = [...root.querySelectorAll('button')]
      .find(b => b.querySelector('canvas') && !b.disabled && !/EQUIPPED/.test(b.textContent));
    if (!tile) return null;
    const label = tile.textContent.trim(); tile.click(); return label;
  })()`)
  note(`equipped colourway: ${picked ?? 'none available'}`)
  check('equipping a colourway closes the wardrobe', picked && !await wardrobeUp())

  // ── The drawer scrim dismisses through the stack, not its own handler ──────
  check('the drawer is still open before the scrim press', await drawerOpen())
  note(`scrim press landed on: ${await evaluate(send, pressAt(370, 400))}`)
  await sleep(400)
  check('pressing the scrim dismisses the drawer', !await drawerOpen())

  // ── Fast travel: choosing a destination closes the picker and starts the trip ──
  await evaluate(send, `[...document.querySelectorAll('button')].find(b => /world map/i.test(b.title || ''))?.click()`)
  await sleep(700)
  check('fast-travel map opens', await mapUp())
  const dest = await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('.zone-track-modal .zone-stop')].find(x => !x.disabled);
    if (!b) return null;
    const n = b.querySelector('.zone-stop-name').textContent; b.click(); return n;
  })()`)
  note(`travel destination: ${dest ?? 'none reachable'}`)
  check('choosing a destination closes the map', dest && !await mapUp())
  check('...and travel actually started', /Travelling|→/.test(
    await evaluate(send, `document.querySelector('.zone-track-status')?.textContent ?? ''`)))

  // ── The zone setting lives with the zones, and exists exactly once ─────────
  await evaluate(send, ensureHeroDrawer)
  await sleep(700)
  check('roam toggle sits under the zone track',
    await evaluate(send, `!!document.querySelector('.zone-track .zone-track-auto input')`))
  check('roam toggle is not in the bag',
    !await evaluate(send, `[...document.querySelectorAll('.app-sidebar-right label')].some(l => /Roam onward/.test(l.textContent))`))
  check('exactly one roam toggle exists in the DOM',
    await evaluate(send, `document.querySelectorAll('.zone-track-auto').length`) === 1)

  const before = await evaluate(send, `document.querySelector('.zone-track-auto input').checked`)
  await evaluate(send, `document.querySelector('.zone-track-auto input').click()`)
  await sleep(400)
  check('roam toggle actually toggles',
    await evaluate(send, `document.querySelector('.zone-track-auto input').checked`) !== before)

  // ── Outside-press is stack-aware ───────────────────────────────────────────
  // The drawer is open and the wardrobe is portalled OUT of it to <body>, so every press
  // inside the modal is geometrically outside the drawer. A per-surface handler on the
  // drawer would dismiss it the instant you touched the thing it raised.
  await evaluate(send, clickText('/^Looks$/i'))
  await waitFor(send, `!!document.querySelector('[data-surface="wardrobe"] [role="dialog"]')`)
  await evaluate(send, `(() => {
    const d = document.querySelector('[data-surface="wardrobe"] [role="dialog"]');
    const r = d.getBoundingClientRect();
    d.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: Math.round(r.x + r.width / 2), clientY: Math.round(r.y + 30),
    }));
  })()`)
  await sleep(400)
  check('pressing inside the modal does not dismiss the drawer beneath it', await drawerOpen())
  check('...and does not dismiss the modal either', await wardrobeUp())

  await evaluate(send, `document.querySelector('[data-surface="wardrobe"]').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }))`)
  await sleep(400)
  check('pressing the scrim dismisses the modal', !await wardrobeUp())
  check('...and still leaves the drawer under it open', await drawerOpen())

  // ── Focus goes into a modal and comes back out ─────────────────────────────
  const focusStory = await evaluate(send, `(() => {
    const opener = [...document.querySelectorAll('button')].find(b => /^Looks$/i.test(b.textContent));
    opener.focus();
    const before = opener === document.activeElement;
    opener.click();
    return { before };
  })()`)
  await waitFor(send, `document.activeElement?.getAttribute('role') === 'dialog'
    || !!document.querySelector('[data-surface="wardrobe"] [role="dialog"]')?.contains(document.activeElement)`)
  check('opening a modal moves focus into it', focusStory.before && await evaluate(send, `
    !!document.querySelector('[data-surface="wardrobe"] [role="dialog"]')?.contains(document.activeElement)`))
  await pressKey(send, 'Escape')
  check('closing it puts focus back on what opened it',
    await evaluate(send, `/^Looks$/i.test(document.activeElement?.textContent ?? '')`))
}
