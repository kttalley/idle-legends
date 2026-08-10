import { evaluate, enterGame, seedSave, tap, waitFor, sleep } from '../cdp.mjs'

// The objective tracker.
//
// The bug it fixes is one of absence, so the assertions are mostly about a thing being
// PRESENT at a moment it previously was not: `activeQuest` existed in the store from the
// day zone progression shipped, but rendered only through `QuestToast`, which gates on
// `completed && !claimed`. The game announced its objective at the exact moment that
// objective stopped being one.

export const name = 'objectives'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

const trackerText = `document.querySelector('.objective-tracker')?.innerText.replace(/\\n/g, ' | ') ?? null`

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })

  // ── The whole point: a brand-new hero is told what to do ───────────────────
  check('a fresh hero sees an objective before completing anything',
    await evaluate(send, `!!document.querySelector('.objective-tracker')`))
  const fresh = await evaluate(send, trackerText)
  note(`fresh: ${fresh}`)
  check('it names the region', /Clear /i.test(fresh ?? ''))
  check('it states the kill objective with a running count', /0\/\d+|\d+\/\d+/.test(fresh ?? ''))
  check('it states the boss objective up front, before it is reachable',
    /Defeat /i.test(fresh ?? ''))

  // ── It tracks state rather than rendering once ─────────────────────────────
  await seedSave(send, appUrl, { level: 9, totalZoneKills: { sunhollow_meadows: 20 } })
  await waitFor(send, `/20\\//.test(${trackerText} ?? '')`)
  note(`mid: ${await evaluate(send, trackerText)}`)
  check('the count follows the save', /20\/35/.test(await evaluate(send, trackerText) ?? ''))
  const meter = await evaluate(send, `(() => {
    const i = document.querySelector('.objective-meter > i');
    const track = document.querySelector('.objective-meter');
    if (!i || !track) return null;
    return Math.round((i.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100);
  })()`)
  note(`meter fill: ${meter}% (expected ~57%)`)
  check('the progress bar matches the count', meter !== null && Math.abs(meter - 57) < 6)

  // ── The boss step lights up exactly when it becomes actionable ─────────────
  await seedSave(send, appUrl, { level: 9, totalZoneKills: { sunhollow_meadows: 35 } })
  await waitFor(send, `/READY|ready/.test(${trackerText} ?? '')`)
  const ready = await evaluate(send, trackerText)
  note(`boss ready: ${ready}`)
  check('the kill objective reads as done', /35\/35/.test(ready ?? ''))
  check('the boss objective is called out as ready', /ready/i.test(ready ?? ''))

  // ── Once the zone is cleared the tracker gets out of the way ───────────────
  // QuestToast owns the completion beat; two surfaces claiming it would talk over
  // each other.
  await seedSave(send, appUrl, {
    level: 12,
    totalZoneKills: { sunhollow_meadows: 40 },
    bossesDefeated: ['sunhollow_meadows'],
  })
  await sleep(1500)
  check('the tracker stands down once the zone is cleared',
    await evaluate(send, `!document.querySelector('.objective-tracker')`))

  // ── Collapse is remembered ─────────────────────────────────────────────────
  // A tracker you cannot shut up is clutter to a veteran; one you must re-dismiss every
  // session is worse than one that never collapsed.
  await seedSave(send, appUrl, { level: 4, totalZoneKills: { sunhollow_meadows: 8 }, bossesDefeated: [] })
  await waitFor(send, `!!document.querySelector('.objective-tracker')`)
  await evaluate(send, `document.querySelector('.objective-tracker-head').click()`)
  await sleep(400)
  check('the header collapses the body',
    await evaluate(send, `!document.querySelector('.objective-body')`))
  await send('Page.reload', { ignoreCache: false })
  await waitFor(send, `!!document.querySelector('.objective-tracker')`, { timeout: 30000 })
  await sleep(800)
  check('...and stays collapsed across a reload',
    await evaluate(send, `!document.querySelector('.objective-body')`))
  await evaluate(send, `document.querySelector('.objective-tracker-head').click()`)
  await sleep(400)
  check('and it can be reopened', await evaluate(send, `!!document.querySelector('.objective-body')`))

  // ── The quest tracks the zone you are STANDING IN ──────────────────────────
  // The bug: both zone-change paths fell back to the previous quest when the destination
  // was already cleared, so backtracking left the quest pointing at the zone you had left.
  // Kills only ever increment `totalZoneKills[currentZone]`, so the objective count froze
  // and stayed frozen — and because rehydrate only filled a NULL quest, an affected save
  // carried the stale one for the life of the character.
  await seedSave(send, appUrl, {
    level: 14,
    currentZone: 'dustwind_plains',
    unlockedZones: ['sunhollow_meadows', 'dustwind_plains'],
    bossesDefeated: ['sunhollow_meadows'],
    totalZoneKills: { sunhollow_meadows: 51, dustwind_plains: 9 },
    // A quest left pointing at the previous zone — exactly the shape a damaged save has.
    activeQuest: {
      id: 'quest:sunhollow_meadows',
      zoneId: 'sunhollow_meadows',
      title: 'Clear Sunhollow Meadows',
      description: 'stale',
      levelReq: 1, killsReq: 35, bossId: 'meadow_beast',
      rewardZoneId: 'dustwind_plains', completed: false, claimed: false,
    },
  })
  await waitFor(send, `!!document.querySelector('.objective-tracker')`)
  const healed = await evaluate(send, trackerText)
  note(`stale quest after reload: ${healed}`)
  check('a save carrying a quest for the wrong zone is repaired on load',
    /Dustwind/i.test(healed ?? '') && !/Sunhollow/i.test(healed ?? ''))
  check('...and the count reflects the zone the hero is actually in',
    /\b9\//.test(healed ?? ''))

  // ── It does not steal the world ────────────────────────────────────────────
  // `.hud-layer` is pointer-events:none so the world stays tappable; only the header
  // claims events back. A tracker that swallowed taps would break move-to in the corner
  // of the screen it occupies.
  const body = await evaluate(send, `(() => {
    const el = document.querySelector('.objective-body');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.round(r.x + r.width - 6), y = Math.round(r.y + r.height - 4);
    return { x, y, hit: document.elementFromPoint(x, y)?.className ?? 'none' };
  })()`)
  note(`point inside the tracker body hits: ${body?.hit}`)
  check('the tracker body does not capture pointer events',
    await evaluate(send, `getComputedStyle(document.querySelector('.objective-body')).pointerEvents !== 'auto'`))
  if (body) {
    await tap(send, body.x, body.y)
    check('the app survives a tap through the tracker',
      await evaluate(send, `!!window.__ilScene && !!document.querySelector('.objective-tracker')`))
  }
}
