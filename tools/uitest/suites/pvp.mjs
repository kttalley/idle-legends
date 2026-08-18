import { enterGame, evaluate, waitFor, sleep, seedSave } from '../cdp.mjs'

// ── PvP, duels, and the faction wall ──────────────────────────────────────────
//
// Four rules, none of which `tsc` can see:
//
//   1. You may only group with your OWN faction. A hostile's card carries no invite at
//      all, and `joinParty` refuses one even if something else calls it.
//   2. You may attack the other faction. That turns an ambient hero into a live body in
//      `state.mobs`, and the kill pays honor — no gold, no loot, no XP.
//   3. A duel is a real fight too, against your own side, with nothing at stake.
//   4. The other faction can open on YOU, unprovoked (`wouldAttackUnprovoked`).
//
// ── Why nothing here is identified by name ────────────────────────────────────
// Ambient hero names are NOT unique — the pool is small enough that two Joras routinely
// share a zone, which is exactly why `entityKey` folds in class, race and level. The first
// cut of this suite picked a hero by name out of `ambientScreenPositions()` and then tapped
// `.find(h => h.name === …)`, which resolved to a DIFFERENT person with the same name: it
// reported "the card offers no attack" against a card that plainly showed one, and called
// a hostile hero a friendly.
//
// So the CARD is the source of truth. The driver taps bodies until a card of the shape it
// wants opens, and asserts against that card. Nothing downstream depends on having guessed
// correctly who was under the finger.

export const name = 'pvp'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

const CARD = `(() => {
  const el = document.querySelector('.player-card');
  return el ? el.textContent : '';
})()`

/** Tap the i-th visible ambient hero through the real tap handler. */
const tapNth = i => `(() => {
  const s = window.__ilScene;
  const c = document.querySelector('canvas');
  if (!s || !c) return 'no-scene';
  const r = c.getBoundingClientRect();
  const k = r.width / c.width;
  const hit = s.ambientScreenPositions()[${i}];
  if (!hit) return 'gone';
  s.moveTo(r.left + hit.sx * k, r.top + hit.sy * k);
  return 'tapped';
})()`

/**
 * Tap bodies until a card matching `want` opens, and return its text.
 *
 * Re-reads positions every attempt rather than reusing a coordinate: the crowd walks, and
 * a stale coordinate opens no card at all — which reads as a broken card rather than as a
 * missed tap.
 */
async function findCard(send, want, tries = 16) {
  for (let n = 0; n < tries; n++) {
    await evaluate(send, `document.body.click()`)
    await sleep(150)
    const count = await evaluate(send, `(window.__ilScene?.ambientScreenPositions() ?? []).length`)
    if (!count) { await sleep(800); continue }
    await evaluate(send, tapNth(n % count))
    await sleep(420)
    const text = await evaluate(send, CARD)
    if (text && want(text)) return text
  }
  return null
}

const isHostileCard = t => /cannot group/i.test(t)
const isFriendlyCard = t => /invite to party/i.test(t)

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })
  // Two unequipped level-1 characters take a long time to settle anything. Seeding levels
  // the hero so the fights below resolve inside the suite's patience.
  await seedSave(send, appUrl, { level: 30 })
  await sleep(1500)

  // ── A friendly: still groupable, still duellable ───────────────────────────
  const friendly = await findCard(send, isFriendlyCard)
  check('a same-faction hero can be found and tapped', !!friendly)
  if (friendly) {
    note(`friendly card: ${friendly.replace(/\s+/g, ' ').slice(0, 160)}`)
    check('a friendly can still be invited', /invite to party/i.test(friendly))
    check('a friendly can still be duelled', /duel/i.test(friendly))
    check('a friendly is not marked hostile', !/cannot group/i.test(friendly))

    // ── Rule 3: a duel is a real fight ──────────────────────────────────────
    // It used to resolve instantly into three lines of chat. The evidence that it is real
    // now is a BODY in the field — the same projection the faction fight is checked by.
    const duelled = await evaluate(send, `(() => {
      const btn = [...document.querySelectorAll('.player-card-btn')]
        .find(b => /^duel/i.test(b.textContent.trim()));
      if (!btn) return false; btn.click(); return true;
    })()`)
    check('the duel button is clickable', duelled)
    await sleep(900)
    const duelPlates = await evaluate(send, `JSON.stringify(window.__ilScene?.pvpPlates ?? [])`)
    note(`duel plates: ${duelPlates}`)
    check('the duel spawns a real body in the world',
      JSON.parse(duelPlates).some(p => p.duel))

    const settled = await waitFor(send,
      `/yields|wins the duel|in the duel/i.test(document.body.innerText)`,
      { timeout: 120000 })
    note(settled ? 'duel settled' : 'duel did not settle inside 120s')
    if (settled) {
      const after = await evaluate(send, `document.body.innerText`)
      // Either ending is fine; what must not happen is a corpse.
      check('a duel never kills the player', !/You have been slain/i.test(after))
    }
  }

  // ── A hostile: no grouping, and an attack ──────────────────────────────────
  const hostile = await findCard(send, isHostileCard)
  check('an enemy-faction hero can be found and tapped', !!hostile)
  if (!hostile) return
  note(`hostile card: ${hostile.replace(/\s+/g, ' ').slice(0, 160)}`)
  check('the card offers no way to group with them', !isFriendlyCard(hostile))
  check('the card says why', /cannot group/i.test(hostile))
  check('the card offers an attack', /attack/i.test(hostile))
  // Talking across the line is still allowed — it is just hostile.
  check('the card still offers a channel to talk on', /trash talk|whisper/i.test(hostile))

  // ── Rule 2: attacking pulls them into the field ────────────────────────────
  // Straight from the card the checks above left open, for the same reason `findCard`
  // exists: re-tapping a walking crowd lands on empty ground.
  const attacked = await evaluate(send, `(() => {
    const btn = [...document.querySelectorAll('.player-card-btn')]
      .find(b => /attack/i.test(b.textContent));
    if (!btn) return false; btn.click(); return true;
  })()`)
  check('the attack button is clickable', attacked)
  await sleep(900)

  // `state.mobs` is not directly readable (there is deliberately no `window.__ilStore`),
  // but the plate list is rebuilt from it every sync, so a plate IS a body.
  const plates = await evaluate(send, `JSON.stringify(window.__ilScene?.pvpPlates ?? [])`)
  note(`pvp plates: ${plates}`)
  const target = JSON.parse(plates).find(p => !p.duel) ?? null
  check('the enemy player is now a body in the field', !!target)
  if (!target) return

  // Name collisions cut both ways — a SECOND hero of the same name may legitimately still
  // be in the crowd — so suppression is reported rather than asserted.
  const stillInCrowd = await evaluate(send, `(() => {
    const n = ${JSON.stringify(target.name)};
    return (window.__ilScene?.ambientScreenPositions() ?? []).some(h => h.name === n);
  })()`)
  note(`an ambient body named ${target.name} still drawn: ${stillInCrowd}`)

  check('the fight is declared in the log',
    await waitFor(send, `/turns on you|You attack|attacks you/i.test(document.body.innerText)`,
      { timeout: 6000 }))

  // ── Rule 2b: the kill pays honor and nothing else ──────────────────────────
  const killed = await waitFor(send,
    `/You have slain/i.test(document.body.innerText)`, { timeout: 120000 })
  note(killed ? 'kill landed' : 'no kill inside 120s — payout assertions skipped')
  if (killed) {
    const logs = await evaluate(send, `(() => {
      const rows = [...document.querySelectorAll('.combat-log > div')].map(d => d.textContent);
      const i = rows.findIndex(r => /You have slain/i.test(r));
      // The log renders newest-first, so this kill's payout sits ABOVE its death line.
      return JSON.stringify(rows.slice(Math.max(0, i - 4), i + 1));
    })()`)
    note(`around the kill: ${logs}`)
    check('the kill pays honor', /Honor \+1/i.test(logs))
    // The two things a PvP kill must never pay. Scoped to a window around the kill line,
    // because ordinary mob kills are landing in the same log.
    check('the kill pays no gold', !/\+\d+ gold/i.test(logs))
    check('the kill pays no loot', !/Looted|Equipped/i.test(logs))
  }

  // ── The honor ladder reports it ────────────────────────────────────────────
  await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('.app-dock-btn')].find(x => /menu/i.test(x.textContent));
    if (b) b.click();
  })()`)
  await sleep(400)
  await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('.hero-bar-btn')].find(x => /ladder/i.test(x.textContent));
    if (b) b.click();
  })()`)
  await sleep(600)
  const honorOpened = await evaluate(send, `(() => {
    const t = [...document.querySelectorAll('.ladder-tab')].find(x => /honor/i.test(x.textContent));
    if (!t) return false; t.click(); return true;
  })()`)
  check('the ladder has a PVP HONOR tab', honorOpened)
  await sleep(500)
  const honorText = await evaluate(send,
    `(document.querySelector('.ladder-record')?.textContent ?? '').replace(/\\s+/g, ' ')`)
  note(`honor tab: ${honorText.slice(0, 200)}`)
  check('the honor tab reports a kill record', /kill/i.test(honorText))
  if (killed) check('the honor tab counts the kill', /^[1-9]/.test(honorText.trim()))
}
