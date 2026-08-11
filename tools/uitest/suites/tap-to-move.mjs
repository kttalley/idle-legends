import { enterGame, evaluate, sleep } from '../cdp.mjs'

// Tap-to-move must reach every tile you can SEE.
//
// The overworld is a wrapping 64×64 torus: `confinePlayer` wraps the hero, and
// `followPath` aims at the wrapped copy of a goal nearest the walker. But `moveTo` used to
// CLAMP the tapped point to [PAD+1, PAD+63] — so any on-screen tile that inverted outside
// that box (routinely, since the camera follows the hero across the seam) was silently
// rewritten to the boundary. The hero walked to the edge and stopped, and the tile you
// touched was unreachable.
//
// Keyboard movement was unaffected, which is exactly what made it look like a rendering or
// pathing problem rather than an input one — and on a build whose primary input is touch,
// "some visible tiles cannot be tapped" is a core-loop bug.
//
// This suite taps real screen points through the canvas and checks the resolved target
// matches the tile under the finger, including deliberately near the seam.

export const name = 'tap-to-move'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

/** Resolve a screen point to a tile the way the scene does, and report what it accepted. */
const probe = (x, y) => `(() => {
  const s = window.__ilScene;
  if (!s) return null;
  s.moveTo(${x}, ${y});
  return { tx: s.tapTx, ty: s.tapTy, active: s.tapMoveActive };
})()`

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })

  const ready = await evaluate(send, `!!window.__ilScene && !!document.querySelector('canvas')`)
  check('the world scene is mounted', ready)
  if (!ready) return

  const rect = await evaluate(send, `(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })()`)
  note(`canvas ${rect.w}x${rect.h} at ${rect.x},${rect.y}`)

  // Put the hero hard against the low edge of the map, where the seam is on screen and
  // where clamping used to do the most damage.
  //
  // Also clear the entities first. `moveTo` runs a hit-test chain — town NPC, ambient hero,
  // current mob, other mobs — and any hit returns EARLY without touching tapTx/tapTy. That
  // is correct behaviour (tapping a monster should fight it, not walk to the dirt under
  // it), but it makes a ground-projection test non-deterministic: a wandering mob drifting
  // under a sample point leaves the previous target in place, which reads as two screen
  // points resolving to the same tile. Probing ground means probing ground.
  await evaluate(send, `(() => {
    const s = window.__ilScene;
    s.player.tx = 17.5; s.player.ty = 17.5;
    s.mob = null; s.showMob = false;
    s.otherMobEnts?.clear?.();
    if (Array.isArray(s.ambient)) s.ambient.length = 0;
    if (Array.isArray(s.townNpcs)) s.townNpcs.length = 0;
  })()`)
  await sleep(300)

  // Sample points spread across the visible canvas, including well left/above the hero —
  // the direction that inverts below the old clamp floor.
  const points = [
    ['upper-left',  rect.x + Math.round(rect.w * 0.18), rect.y + Math.round(rect.h * 0.22)],
    ['upper-right', rect.x + Math.round(rect.w * 0.82), rect.y + Math.round(rect.h * 0.22)],
    ['lower-left',  rect.x + Math.round(rect.w * 0.18), rect.y + Math.round(rect.h * 0.72)],
    ['centre',      rect.x + Math.round(rect.w * 0.50), rect.y + Math.round(rect.h * 0.50)],
  ]

  const results = []
  for (const [label, x, y] of points) {
    const r = await evaluate(send, probe(x, y))
    results.push({ label, ...r })
    await sleep(120)
  }
  note(results.map(r => `${r.label} → (${r.tx?.toFixed(1)}, ${r.ty?.toFixed(1)})`).join('  |  '))

  check('every tapped point resolves to a target', results.every(r => r && r.active === true))

  // The regression signature: clamped taps pile up on the boundary value, so several
  // distinct screen points collapse onto the same coordinate.
  const PAD_FLOOR = 17 // PAD + 1
  const pinned = results.filter(r =>
    Math.abs(r.tx - PAD_FLOOR) < 0.01 || Math.abs(r.ty - PAD_FLOOR) < 0.01)
  check('no tap is pinned to the old clamp boundary', pinned.length === 0,
    pinned.length ? `${pinned.map(p => p.label).join(', ')} landed exactly on ${PAD_FLOOR}` : '')

  const unique = new Set(results.map(r => `${r.tx.toFixed(2)},${r.ty.toFixed(2)}`))
  check('distinct screen points give distinct tiles', unique.size === results.length,
    `${unique.size}/${results.length} unique`)

  // Direction sanity: on a 2:1 dimetric projection, tapping LEFT of the hero must not
  // resolve to a tile right of it. Uses wrapped deltas, since the hero sits on the seam.
  const dir = await evaluate(send, `(() => {
    const s = window.__ilScene;
    const M = 64, wrapDiff = (a, b) => { let d = (a - b) % M; d = ((d % M) + M) % M; return d > M/2 ? d - M : d; };
    // Snapshot the hero ONCE. The game loop keeps running between the two moveTo calls, so
    // reading s.player after each one measures the two taps from different origins and the
    // comparison drifts — the assertion then fails or passes on timing rather than on
    // projection correctness.
    const px = s.player.tx, py = s.player.ty;
    s.moveTo(${rect.x + Math.round(rect.w * 0.15)}, ${rect.y + Math.round(rect.h * 0.5)});
    const left = { dx: wrapDiff(s.tapTx, px), dy: wrapDiff(s.tapTy, py) };
    s.moveTo(${rect.x + Math.round(rect.w * 0.85)}, ${rect.y + Math.round(rect.h * 0.5)});
    const right = { dx: wrapDiff(s.tapTx, px), dy: wrapDiff(s.tapTy, py) };
    return { left, right };
  })()`)
  note(`left tap Δ(${dir.left.dx.toFixed(1)}, ${dir.left.dy.toFixed(1)})  ·  right tap Δ(${dir.right.dx.toFixed(1)}, ${dir.right.dy.toFixed(1)})`)
  // Screen-left is (−x, +y) in tile space and screen-right is the mirror, so the two taps
  // must land on opposite sides. Comparing them to each other rather than to a hardcoded
  // axis keeps this true if the projection is ever retuned.
  check('tapping left and right resolve to opposite directions',
    (dir.left.dx - dir.right.dx) < 0 && (dir.left.dy - dir.right.dy) > 0)

  // And the whole point: a real touch on the canvas moves the hero.
  const before = await evaluate(send, `(() => { const s = window.__ilScene; return { x: s.player.tx, y: s.player.ty }; })()`)
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: rect.x + Math.round(rect.w * 0.3), y: rect.y + Math.round(rect.h * 0.35) }],
  })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(1200)
  const after = await evaluate(send, `(() => { const s = window.__ilScene; return { x: s.player.tx, y: s.player.ty }; })()`)
  // Wrapped delta, or this measures nothing: the hero sits on the seam, so a one-tile step
  // shows up as a ~63-tile raw jump and `moved > 0` passes no matter what happens. Bound it
  // above too — a real walk over ~1.2s covers a few tiles, so an implausibly large distance
  // means the target was wrong rather than that movement worked.
  const M = 64
  const wrapDiff = (a, b) => { let d = (a - b) % M; d = ((d % M) + M) % M; return d > M / 2 ? d - M : d }
  const moved = Math.hypot(wrapDiff(after.x, before.x), wrapDiff(after.y, before.y))
  note(`hero moved ${moved.toFixed(2)} tiles (wrapped) after a real touch`)
  check('a real touch on a visible tile actually moves the hero', moved > 0.05)
  check('...by a plausible walking distance, not a teleport', moved < 20,
    `moved ${moved.toFixed(2)} tiles`)
}
