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
  // where clamping used to do the most damage, and force every tap to the GROUND branch.
  //
  // moveTo runs a hit-test chain — town NPC, ambient hero, current mob, other mobs — and any
  // hit returns early without touching tapTx/tapTy. That is correct behaviour (tapping a
  // monster should fight it, not walk to the dirt under it) but it makes a ground-projection
  // test non-deterministic.
  //
  // Clearing the entity lists was the obvious fix and does NOT hold: the scene re-syncs them
  // from the store every frame, so a mob drifts back under a sample point within a frame or
  // two and the suite flakes. Stubbing the hit-test survives the re-sync, which is the
  // difference between a test that passes and one that passes reliably.
  await evaluate(send, `(() => {
    const s = window.__ilScene;
    s.player.tx = 17.5; s.player.ty = 17.5;
    s.__origHitTest = s.hitTestEntity;
    s.hitTestEntity = () => false;
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

  // The regression signature is COLLAPSE onto the boundary — under the old clamp every tap
  // past the edge became exactly PAD+1, so several distinct points shared it.
  //
  // Asserting "no tap equals 17" was wrong and flaked: with wrapping, 17 is an ordinary
  // legal coordinate, and across 4 points × 2 axes at 0.01 tolerance one lands there by
  // chance every few runs. Requiring TWO or more is the actual signature and has no false
  // positive.
  const PAD_FLOOR = 17 // PAD + 1
  const onFloor = results.filter(r =>
    Math.abs(r.tx - PAD_FLOOR) < 0.01 || Math.abs(r.ty - PAD_FLOOR) < 0.01)
  check('taps are not collapsing onto the old clamp boundary', onFloor.length < 2,
    onFloor.length >= 2 ? `${onFloor.map(p => p.label).join(', ')} all landed on ${PAD_FLOOR}` : '')

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

  // And the whole point: a REAL touch — not a synthetic moveTo call — resolves to the right
  // tile. This asserts the target, not the walk.
  //
  // Locomotion is deliberately not asserted here: combat outranks tap-move by design
  // (mobEngaged clears tapMoveActive, combatAdapter ~L2353), and at level 24 in Grimshade
  // the hero is in combat most of the time, so "did the hero move" flaked 2 runs in 5 for
  // reasons that were correct behaviour. The bug this suite exists for was target
  // RESOLUTION — which tile a tap maps to — so that is what gets asserted.
  // Pick a point that genuinely lands on the WORLD CANVAS. A fixed fraction does not: at
  // (0.3w, 0.35h) the touch landed under the unit-frame panel, whose height changes with
  // however many buffs are active, so the canvas never saw the event and tapTx stayed
  // untouched on ~2 runs in 5. elementFromPoint settles it instead of guessing.
  const pt = await evaluate(send, `(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    for (const [fx, fy] of [[0.5,0.5],[0.4,0.55],[0.6,0.45],[0.35,0.62],[0.65,0.6]]) {
      const x = Math.round(r.x + r.width * fx), y = Math.round(r.y + r.height * fy);
      const el = document.elementFromPoint(x, y);
      if (el && el.tagName === 'CANVAS') return { x, y };
    }
    return null;
  })()`)
  check('found a point on the world canvas, clear of the HUD', pt !== null)
  if (!pt) return

  await evaluate(send, `(() => { const s = window.__ilScene; s.tapTx = -999; s.tapTy = -999; })()`)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(350)

  // Compare against a moveTo at the SAME point taken right afterwards. The camera scrolls
  // continuously, so an expectation computed before the touch drifts by a fraction of a
  // tile; back-to-back keeps the comparison meaningful. Tolerance is deliberately loose —
  // the regression being guarded against mis-resolved taps by TENS of tiles, not tenths.
  const touched = await evaluate(send, `(() => {
    const s = window.__ilScene;
    const got = { tx: s.tapTx, ty: s.tapTy, engaged: !!s.mobEngaged };
    s.moveTo(${pt.x}, ${pt.y});
    return { got, expect: { tx: s.tapTx, ty: s.tapTy } };
  })()`)

  note(`real touch → (${touched.got.tx?.toFixed(1)}, ${touched.got.ty?.toFixed(1)}) vs moveTo (${touched.expect.tx?.toFixed(1)}, ${touched.expect.ty?.toFixed(1)})${touched.got.engaged ? ' · in combat' : ''}`)

  check('a real touch reaches the scene and sets a ground target',
    touched.got.tx !== -999 && touched.got.ty !== -999)
  check('...resolving to the same tile the projection predicts',
    Math.abs(touched.got.tx - touched.expect.tx) < 2 && Math.abs(touched.got.ty - touched.expect.ty) < 2,
    `got (${touched.got.tx?.toFixed(2)}, ${touched.got.ty?.toFixed(2)}), moveTo (${touched.expect.tx?.toFixed(2)}, ${touched.expect.ty?.toFixed(2)})`)

  // Restore the real hit-test, so nothing after this point runs against a stubbed scene.
  await evaluate(send, `(() => {
    const s = window.__ilScene;
    if (s && s.__origHitTest) { s.hitTestEntity = s.__origHitTest; delete s.__origHitTest; }
  })()`)
}
