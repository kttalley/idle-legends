import { evaluate, enterGame, seedSave, sleep } from '/Users/ktt/Documents/programming-projects-2026/idle-legends/tools/uitest/cdp.mjs'
export const name = 'probe'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }
export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })
  await seedSave(send, appUrl, {
    level: 22, currentZone: 'grimshade_forest',
    unlockedZones: ['sunhollow_meadows','dustwind_plains','grimshade_forest','thornvale_jungle'],
    bossesDefeated: ['sunhollow_meadows','dustwind_plains'],
    totalZoneKills: { sunhollow_meadows: 51, dustwind_plains: 60, grimshade_forest: 18 },
  })
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('.app-dock-btn')].find(x=>/hero/i.test(x.textContent)); b&&b.click(); })()`)
  // Sample scrollLeft over time to see if it is set then reset.
  for (const t of [100, 300, 600, 900, 1400]) {
    await sleep(t === 100 ? 100 : 250)
    const s = await evaluate(send, `(() => {
      const r = document.querySelector('.zone-track-rail');
      if (!r) return 'no rail';
      const c = document.querySelector('.zone-track .zone-stop.is-current');
      return { t: ${t}, sl: Math.round(r.scrollLeft), w: Math.round(r.clientWidth),
               foot: getComputedStyle(document.querySelector('.rail-foot')).display,
               ideal: c ? Math.round(c.offsetLeft - (r.clientWidth - c.offsetWidth)/2) : null };
    })()`)
    note(`t=${t}: ${JSON.stringify(s)}`)
  }
  // Can it hold a scroll position if set manually?
  const held = await evaluate(send, `(() => {
    const r = document.querySelector('.zone-track-rail'); if (!r) return null;
    r.scrollLeft = 26; return Math.round(r.scrollLeft);
  })()`)
  note(`manually set to 26 -> ${held}`)
  await sleep(400)
  const after = await evaluate(send, `Math.round(document.querySelector('.zone-track-rail').scrollLeft)`)
  note(`400ms later -> ${after}`)
  check('probe ran', true)
}
