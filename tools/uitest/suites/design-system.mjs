import { evaluate, enterGame, sleep } from '../cdp.mjs'

// The design system, checked where it actually resolves: in the browser.
//
// `scripts/validate-design-tokens.mjs` proves every `var()` has a definition, which is a
// static property of the source. It cannot prove the value SURVIVES the cascade — a token
// defined on `:root` but shadowed, or a rule that lost a specificity fight, still parses
// fine and still paints the wrong thing. And a mistyped token is not a parse error at all:
// the declaration is dropped and the element quietly inherits.
//
// So this samples what the browser computed for real elements on a real screen.

export const name = 'design-system'
export const device = { width: 1440, height: 900, scale: 1, mobile: false }

// The palette, as it must resolve. Kept as explicit rgb() rather than read back from
// :root — reading the token to check the token proves nothing.
const PALETTE = {
  '--gold': 'rgb(255, 215, 0)',
  '--parchment': 'rgb(212, 184, 150)',
  '--muted': 'rgb(157, 157, 157)',
  '--muted-warm': 'rgb(138, 128, 112)',
  '--gold-deep': 'rgb(200, 161, 0)',
  '--danger': 'rgb(255, 68, 68)',
  '--success': 'rgb(136, 204, 170)',
}

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })

  // ── Every token resolves to the colour it is supposed to be ────────────────
  const resolved = await evaluate(send, `(() => {
    const cs = getComputedStyle(document.documentElement);
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const out = {};
    for (const name of ${JSON.stringify(Object.keys(PALETTE))}) {
      // Round-trip through the color property so the browser normalises to rgb(), which
      // is what getComputedStyle reports everywhere else.
      // (No backticks in this string — it lives inside a JS template literal.)
      probe.style.color = '';
      probe.style.color = 'var(' + name + ')';
      out[name] = { raw: cs.getPropertyValue(name).trim(), computed: getComputedStyle(probe).color };
    }
    probe.remove();
    return out;
  })()`)
  const wrong = Object.entries(PALETTE).filter(([n, want]) => resolved[n]?.computed !== want)
  check('every colour token resolves to its intended value', wrong.length === 0,
    wrong.map(([n, want]) => `${n}: got ${resolved[n]?.computed || 'nothing'}, want ${want}`).join('; '))

  // ── Nothing that renders text ended up with an unresolved colour ───────────
  // The signature of a bad `var()` in a `color` slot: the declaration is dropped and the
  // element inherits, so it does not go transparent — it goes WRONG. Fully transparent
  // text is the other tell, and it is always a bug.
  const invisible = await evaluate(send, `(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.rp-glass *, .app-dock *, .hud-layer *')) {
      if (!el.textContent?.trim() || el.children.length) continue;
      const c = getComputedStyle(el);
      if (c.color === 'rgba(0, 0, 0, 0)' || c.color === 'transparent') {
        bad.push((el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 24));
      }
    }
    return bad;
  })()`)
  check('no visible text resolved to a transparent colour', invisible.length === 0, invisible[0])

  // ── The type system holds: serif is for chrome, sans is for data ───────────
  // The stat rows live inside the character sheet, which is the FOLDED member of the left
  // rail's accordion by default (Zones takes the open slot — see CollapsiblePanel's
  // `group`). Probing without opening it found no stat row at all and reported the type
  // system broken, which is the failure mode of asserting against whatever happens to be on
  // screen rather than against the thing named in the assertion.
  await evaluate(send, `(() => {
    const head = [...document.querySelectorAll('.collapsible-toggle')]
      .find(b => /Warrior|Mage|Warlock|Rogue/i.test(b.textContent || ''));
    if (head && head.getAttribute('aria-expanded') === 'false') head.click();
  })()`)
  await sleep(400)
  const type = await evaluate(send, `(() => {
    const face = el => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '');
    const statRow = [...document.querySelectorAll('.rp-glass span')]
      .find(s => /^(Strength|Stamina|Armor)$/.test(s.textContent.trim()));
    const panelHead = document.querySelector('.rp-panel-header .collapsible-title');
    const button = document.querySelector('.rp-button');
    return {
      body: face(document.body),
      stat: statRow ? face(statRow) : null,
      heading: panelHead ? face(panelHead) : null,
      button: button ? face(button) : null,
    };
  })()`)
  note(`faces — body:${type.body} stat:${type.stat} heading:${type.heading} button:${type.button}`)
  check('body text defaults to the UI sans', type.body !== 'Cinzel')
  check('a stat label is sans, not the display serif', type.stat && type.stat !== 'Cinzel')
  check('a panel heading keeps the display serif', type.heading === 'Cinzel')
  check('a button label keeps the display serif', type.button === 'Cinzel')

  // ── Numbers line up ────────────────────────────────────────────────────────
  // Sans is denser than Cinzel, which is the point, but it also means a column of stat
  // values stops aligning without tabular figures.
  check('glass surfaces use tabular figures', await evaluate(send, `
    getComputedStyle(document.querySelector('.rp-glass')).fontVariantNumeric.includes('tabular-nums')`))
}
