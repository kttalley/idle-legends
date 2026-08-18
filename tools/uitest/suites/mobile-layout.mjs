import { evaluate, enterGame, seedSave, tap, sleep } from '../cdp.mjs'

// Mobile geometry and the world-tap dismissal.
//
// The chat sheet is the one panel with no scrim — a scrim would grey out the world you
// are reading chat ABOUT and swallow the action bar, which on a phone is most of the
// interface. So "tap outside to close" has to come from the world itself, and it has to
// distinguish the world from the HUD floating on top of it. Both halves are asserted with
// real touch events, because the point of the 66% width is that a strip of world stays
// reachable — and `element.click()` would dispatch to a node whether or not a finger
// could ever land on it.

export const name = 'mobile-layout'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

const openDock = label => `(() => {
  const b = [...document.querySelectorAll('.app-dock-btn')].find(x => /${label}/i.test(x.textContent));
  if (!b) return false; b.click(); return true;
})()`

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })

  // ── The dock toggles, with a real finger ───────────────────────────────────
  //
  // Every other dock interaction in these suites goes through `element.click()`, which
  // dispatches NO pointerdown — and pointerdown is the entire mechanism here. The drawers
  // register with the dismissable stack as close-on-outside surfaces, so a press on the
  // dock used to retract the drawer before the button's own click ran, and that click then
  // read a closed panel and extended it again. Net effect on a phone: Hero and the bag
  // opened but could never be closed from the tab bar, while every synthetic-click
  // assertion in this file passed. Touch is the only thing that sees it.
  const openPanels = () => evaluate(send, `(() => ({
    hero: !!document.querySelector('.app-sidebar-left.panel-open'),
    bag:  !!document.querySelector('.app-sidebar-right.panel-open'),
    log:  !!document.querySelector('.app-log.panel-open'),
  }))()`)
  const dockCentre = label => evaluate(send, `(() => {
    const b = [...document.querySelectorAll('.app-dock-btn')].find(x => /${label}/i.test(x.textContent));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`)
  // Dock captions are Menu / Chat / Gear now — see the note in App.tsx.
  for (const [label, key] of [['Menu', 'hero'], ['Chat', 'log']]) {
    const c = await dockCentre(label)
    if (!c) { check(`the ${label} dock button exists`, false); continue }
    await tap(send, c.x, c.y)
    const opened = await openPanels()
    await tap(send, c.x, c.y)
    const closed = await openPanels()
    note(`${label}: tap → ${JSON.stringify(opened)}, tap again → ${JSON.stringify(closed)}`)
    check(`tapping ${label} extends its panel`, opened[key])
    check(`tapping ${label} again RETRACTS it`, !closed[key])
  }

  // ── The two top corners are anchored the same, and neither drifts ──────────
  //
  // `.hud-tl` used to inset by `--rail-l`, so the unit frames sat 52px in (and 252px in
  // with the hero drawer out) while the minimap opposite them sat at 8px — your own health
  // bar sliding sideways in response to a panel, in a game whose whole loop is watching it.
  // The `@media (max-width: 899px)` rule that meant to pull them to the edge could never
  // win: `.app-root[data-left-collapsed="true"]` is (0,2,0) against its (0,1,0), and a
  // media query adds no specificity.
  const corners = () => evaluate(send, `(() => {
    const l = document.querySelector('.hud-tl').getBoundingClientRect();
    const r = document.querySelector('.hud-tr').getBoundingClientRect();
    return { left: Math.round(l.x), rightGap: Math.round(innerWidth - r.right), top: Math.round(l.y) };
  })()`)
  const shut = await corners()
  note(`top corners: left inset ${shut.left}px, right inset ${shut.rightGap}px`)
  check('the unit frames are inset like the minimap opposite them', shut.left === shut.rightGap)
  const heroBtn = await dockCentre('Menu')
  await tap(send, heroBtn.x, heroBtn.y)
  const withDrawer = await corners()
  check('...and do not move when the hero drawer comes out',
    withDrawer.left === shut.left && withDrawer.top === shut.top,
    `${shut.left} → ${withDrawer.left}`)
  await tap(send, heroBtn.x, heroBtn.y)

  const chatOpen = () => evaluate(send, `!!document.querySelector('.app-log.panel-open')`)
  const alive = () => evaluate(send, `!!document.querySelector('.app-log') && !!window.__ilScene`)
  const openChat = async () => { await evaluate(send, openDock('Chat')); await sleep(800) }

  // ── The feed must not be a curtain across the screen ───────────────────────
  await openChat()
  check('chat sheet opens', await chatOpen())
  const box = await evaluate(send, `(() => {
    const r = document.querySelector('.app-log').getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), vw: innerWidth };
  })()`)
  note(`chat sheet: ${box.w}px of ${box.vw}px, left edge at x=${box.x}`)
  check('chat sheet is at most two thirds of the viewport', box.w <= box.vw * 0.67 + 1)
  check('chat sheet is pinned to the trailing edge', box.x > box.vw * 0.3)
  check('a strip of world stays reachable to its left', box.x > 60)

  // ── Tapping the world dismisses it; tapping the HUD does not ───────────────
  await tap(send, Math.round(box.x / 2), 400)
  check('tapping the world closes chat', !await chatOpen())

  await openChat()
  const hudBtn = await evaluate(send, `(() => {
    // A HUD control whose centre is clear of the sheet, so the tap really lands on it.
    const sheet = document.querySelector('.app-log').getBoundingClientRect();
    const b = [...document.querySelectorAll('.hud-layer button')].find(el => {
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      // Action bar only: the minimap's buttons raise their own overlays, which is a
      // different interaction than "I used a control while reading chat".
      return r.width > 8 && cy > innerHeight * 0.6 &&
        !(cx > sheet.x && cx < sheet.right && cy > sheet.y && cy < sheet.bottom);
    });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: (b.textContent || b.title || '?').trim().slice(0, 24) };
  })()`)
  if (hudBtn) {
    note(`HUD control tapped: ${hudBtn.label}`)
    await tap(send, hudBtn.x, hudBtn.y)
    check('the app survives a HUD tap', await alive())
    check('tapping the action bar leaves chat open', await chatOpen())
  } else {
    check('found a HUD control clear of the sheet', false, 'none matched — assertion skipped')
  }

  const inside = await evaluate(send, `(() => {
    const r = document.querySelector('.app-log').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 40) };
  })()`)
  await tap(send, inside.x, inside.y)
  check('tapping inside the sheet leaves it open', await chatOpen())

  // ── The action bar is legible and fully reachable ──────────────────────────
  // The mode toggles carried `title` and `aria-label` only, which is a tooltip on desktop
  // and nothing at all on the platform this ships to.
  const bar = await evaluate(send, `(() => {
    const panel = document.querySelector('.hud-bottom > div > div');
    if (!panel) return null;
    const labels = [...panel.querySelectorAll('button span')]
      .map(s => s.textContent.trim())
      .filter(t => /^[A-Za-z]{3,8}$/.test(t));
    return {
      labels: [...new Set(labels)],
      overflow: panel.scrollWidth - panel.clientWidth,
      slots: document.querySelectorAll('.skill-btn, .skill-slot-locked').length,
      slotsInView: [...document.querySelectorAll('.skill-btn, .skill-slot-locked')]
        .filter(e => e.getBoundingClientRect().right <= innerWidth + 1).length,
    };
  })()`)
  note(`action bar labels: ${bar?.labels.join(', ')}`)
  // Assert the PROPERTY, not a headcount. This was `labels.length >= 4`, which encoded
  // that there were five mode toggles at the time it was written — so moving Town and the
  // idle/manual toggle onto the minimap failed a check about captions for a reason that
  // had nothing to do with captions. What matters is that every toggle still has one.
  const uncaptioned = await evaluate(send, `(() => {
    return [...document.querySelectorAll('.mode-btn')]
      .filter(b => !(b.querySelector('.mode-btn-label')?.textContent || '').trim())
      .length;
  })()`)
  const modeCount = await evaluate(send, `document.querySelectorAll('.mode-btn').length`)
  check('there are mode toggles to caption', modeCount > 0)
  check('every mode toggle carries a visible caption, not just a tooltip', uncaptioned === 0)

  // The two controls that left the bar must still be reachable and named. A control that
  // moved somewhere unlabelled is worse than one that never moved.
  const sats = await evaluate(send, `(() => {
    return [...document.querySelectorAll('.minimap-sat')]
      .map(b => b.getAttribute('aria-label') || b.getAttribute('title') || '')
      .filter(Boolean);
  })()`)
  note(`minimap satellites: ${sats.join(', ')}`)
  check('town moved to the minimap and is still labelled',
    sats.some(s => /town/i.test(s)))
  check('the idle/manual toggle moved with it',
    sats.some(s => /manual|idle|auto/i.test(s)))
  check('the bar does not overflow its own width', bar?.overflow === 0)
  check('every ability slot is on screen', bar && bar.slots > 0 && bar.slotsInView === bar.slots,
    bar ? `${bar.slotsInView}/${bar.slots} in view` : 'no slots found')

  // --actionbar-h is what the chat sheet and whisper window reserve so they can never
  // cover the primary controls. It was hardcoded at 96px and is now measured; if the two
  // ever disagree the sheet silently overlaps the bar.
  const reserve = await evaluate(send, `(() => {
    const stack = document.querySelector('.hud-bottom').getBoundingClientRect();
    const declared = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--actionbar-h'));
    return { declared, actual: Math.round(stack.height) };
  })()`)
  note(`--actionbar-h ${reserve?.declared}px vs measured stack ${reserve?.actual}px`)
  check('the reserved height matches the bar that is actually rendered',
    reserve && Math.abs(reserve.declared - reserve.actual) <= 1)

  await evaluate(send, openDock('Chat'))
  await sleep(700)
  check('the chat sheet clears the action bar rather than covering it',
    await evaluate(send, `(() => {
      const log = document.querySelector('.app-log').getBoundingClientRect();
      const stack = document.querySelector('.hud-bottom').getBoundingClientRect();
      return log.bottom <= stack.top + 1;
    })()`))
  await evaluate(send, openDock('Chat'))
  await sleep(500)

  // ── The zone track is a track, not a list ──────────────────────────────────
  // The whole point of the redesign: twelve zones in ~90px instead of ~380px, so the
  // character sheet and the zones can both be open. If this height regresses, the reason
  // the rail was rebuilt is gone.
  const measure = () => evaluate(send, `(() => {
    const rail = document.querySelector('.zone-track-rail');
    const stops = [...document.querySelectorAll('.zone-track .zone-stop')];
    if (!rail || !stops.length) return null;
    const r = rail.getBoundingClientRect();
    const current = document.querySelector(".zone-track .zone-stop.is-current");
    const c = current?.getBoundingClientRect();
    return {
      stops: stops.length,
      height: Math.round(document.querySelector('.zone-track').getBoundingClientRect().height),
      scrollable: rail.scrollWidth > rail.clientWidth + 4,
      scrollLeft: Math.round(rail.scrollLeft),
      railW: Math.round(rail.clientWidth),
      contentW: Math.round(rail.scrollWidth),
      // What ZoneTrack's centring formula evaluates to right now. Kept in the note because
      // this is exactly the number that silently went negative when the rail was measured
      // before it was constrained — see the comment in ZoneTrack.
      ideal: current ? Math.round(current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2) : null,
      offCentre: c ? Math.round(Math.abs((c.x + c.width / 2) - (r.x + r.width / 2))) : null,
    };
  })()`)

  await evaluate(send, openDock('Menu'))
  await sleep(800)
  const first = await measure()
  note(`zone track: ${first?.stops} stops in ${first?.height}px`)
  check('every zone is on the track', first?.stops >= 12)
  check('the track stays compact', first && first.height < 160)
  check('distant zones remain reachable by scrolling', !!first?.scrollable)
  // Zone one has nothing behind it, so its centred position does not exist and the track
  // clamps left. Asserting "centred" here would be asserting a blank gutter.
  check('the first zone clamps to the left rather than leaving a gutter', first?.scrollLeft === 0)

  await seedSave(send, appUrl, {
    level: 22,
    currentZone: 'grimshade_forest',
    unlockedZones: ['sunhollow_meadows', 'dustwind_plains', 'grimshade_forest', 'thornvale_jungle'],
    bossesDefeated: ['sunhollow_meadows', 'dustwind_plains'],
    totalZoneKills: { sunhollow_meadows: 51, dustwind_plains: 60, grimshade_forest: 18 },
  })
  await evaluate(send, openDock('Menu'))
  await sleep(900)
  const mid = await measure()
  note(`mid-track: scrollLeft ${mid?.scrollLeft} (ideal ${mid?.ideal}), offCentre ${mid?.offCentre}px, rail ${mid?.railW}px of ${mid?.contentW}px content`)
  // `scrollLeft > 0` alone is weak — it was the assertion that failed for weeks-worth of
  // wrong reasons. Assert the track landed where its own formula wanted, so a future
  // regression that clamps to 0 (or overshoots) is named rather than merely detected.
  check('a mid-track zone scrolls itself into view', mid && mid.scrollLeft > 0)
  check('...and lands where the centring formula asked for',
    mid && mid.ideal > 0 && Math.abs(mid.scrollLeft - mid.ideal) <= 2,
    mid ? `scrollLeft ${mid.scrollLeft} vs ideal ${mid.ideal}` : 'no measurement')
  check('...and lands centred, with the zone behind and ahead flanking it',
    mid && mid.offCentre !== null && mid.offCentre < 40)
}
