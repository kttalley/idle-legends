// UI chrome iconography (original art, same indexed pipeline as itemIcons/talentIcons).
//
// Fills the gaps left by the base and item sheets: the glyphs the shell itself needs —
// lock, map, zoom, coin, trophy, warning, travel, dice, quill, bag. With these, no colour
// emoji has to survive as a rendered glyph anywhere in the UI.
//
// Ships on `icon/base`: 1–4 steel/bone/white · 5–8 warm (blood, flame, gold) ·
// 9–12 cool (frost, mana) · 13 nature-green · 14 treasure-gold · 15 arcane-purple.
// 16×16 ASCII in the docs/art-direction.md key ('.' transparent, '1'–'9' → slots 1–9,
// 'A'–'F' → slots 10–15).

import { Painter, type IconSketch } from './placeholderArt'
import type { IndexedSprite } from './types'

const IN = 16

function paint(p: Painter, f: number, rows: IconSketch): void {
  if (rows.length !== IN) console.warn(`[uiIcons] frame ${f}: ${rows.length} rows, expected ${IN}`)
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    if (row.length !== IN) console.warn(`[uiIcons] frame ${f} row ${y}: ${row.length} cols, expected ${IN}`)
    for (let x = 0; x < row.length; x++) {
      const c = row.charCodeAt(x)
      if (c === 46) continue
      p.px(f, x, y, c <= 57 ? c - 48 : c - 55)
    }
  }
}

const STILL = { frames: [0], fps: 1, loop: true }

export const UI_ICON = {
  lock: 0, map: 1, zoom: 2, coin: 3, trophy: 4,
  warn: 5, travel: 6, dice: 7, quill: 8, bag: 9,
} as const
export type UiIconKey = keyof typeof UI_ICON

const U_LOCK: IconSketch = [
  '................', '.....222222.....', '....23333332....', '....23....32....',
  '...23......32...', '...23......32...', '...23......32...', '..EEEEEEEEEEEE..',
  '..E888888888E...', '..E88E8888E88E..', '..E88EE88EE88E..', '..E888E88E888E..',
  '..E8888888888E..', '..EEEEEEEEEEEE..', '................', '................',
]
const U_MAP: IconSketch = [
  '................', '..2222....2222..', '.244442..244442.', '.24DDD42.24DDD4.',
  '.24DD442244DD42.', '.244D4488844D42.', '.24444887884442.', '.24DD48CCC84DD2.',
  '.24DD4887884DD2.', '.244D44888444D2.', '.24DDD4444DDDD2.', '.2444442244DD42.',
  '.244442..244442.', '..2222....2222..', '................', '................',
]
const U_ZOOM: IconSketch = [
  '....333333......', '..33CCCCCC33....', '.3CCCCCCCCC3....', '.3CCC4444CCC3...',
  '3CCC444444CCC3..', '3CC44444444CC3..', '3CC44444444CC3..', '3CCC444444CCC3..',
  '.3CCC4444CCC3...', '.3CCCCCCCCC3....', '..33CCCCCC33....', '....333333222...',
  '..........2222..', '...........2222.', '............222.', '................',
]
const U_COIN: IconSketch = [
  '.....EEEEEE.....', '...EE888888EE...', '..E88888888888E.', '..E8887777888E..',
  '.E888777777888E.', '.E887788887788E.', '.E887788887788E.', '.E887777777788E.',
  '.E887777777788E.', '.E887788887788E.', '.E888778877888E.', '..E8887777888E..',
  '..E88888888888E.', '...EE888888EE...', '.....EEEEEE.....', '................',
]
const U_TROPHY: IconSketch = [
  '...EEEEEEEEEE...', '...E88888888E...', '.EEE88888888EEE.', 'EE8E88888888E8EE',
  'E88E88888888E88E', 'E88E88888888E88E', 'EE8E88888888E8EE', '.EEE888888888EE.',
  '....E8888888E...', '.....E88888E....', '......E888E.....', '.......E8E......',
  '.....EE888EE....', '....E8888888E...', '...EEEEEEEEEE...', '................',
]
const U_WARN: IconSketch = [
  '.......77.......', '.......77.......', '......7887......', '......7887......',
  '.....788887.....', '.....78..87.....', '....788..887....', '....788..887....',
  '...7888..8887...', '...7888..8887...', '..78888888887...', '..788888888887..',
  '.7888888888887..', '.77777777777777.', '................', '................',
]
const U_TRAVEL: IconSketch = [
  '................', '.......44.......', '......3443......', '.....34..43.....', // compass rose
  '....34.CC.43....', '...34.CCCC.43...', '..3444CCCC4443..', '.34CCCCCCCCCC43.',
  '..3444CCCC4443..', '...34.CCCC.43...', '....34.CC.43....', '.....34..43.....',
  '......3443......', '.......44.......', '................', '................',
]
const U_DICE: IconSketch = [
  '................', '..222222222222..', '..234444444432..', '..244444444442..',
  '..244E4444E442..', '..2444444444 42.', '..24444EE4444 2.', '..24444EE444442.',
  '..244444444442..', '..244E4444E4442.', '..2444444444442.', '..2344444444432.',
  '..222222222222..', '................', '................', '................',
]
const U_QUILL: IconSketch = [
  '.............44.', '............344.', '...........3442.', '..........34D2..',
  '.........34DD2..', '........34DD2...', '.......34DD2....', '......34DD2.....',
  '.....34DD2......', '....34DD2.......', '...34DD2........', '..344D2.........',
  '..3442..........', '.2442...........', '.222............', '................',
]
const U_BAG: IconSketch = [
  '................', '.....22..22.....', '....2332332.....', '....23...32.....',
  '...2333333332...', '..255555555552..', '..25666666665 2.', '.2566666666665 2',
  '.25666EE66EE6652', '.25666EE66EE6652', '.2566666666666 2', '.25666666666652.',
  '..2566666666652.', '..25555555555 2.', '...2222222222...', '................',
]

const SKETCHES: IconSketch[] = [
  U_LOCK, U_MAP, U_ZOOM, U_COIN, U_TROPHY, U_WARN, U_TRAVEL, U_DICE, U_QUILL, U_BAG,
]

export function makeUiIconSheet(id = 'icons/ui'): IndexedSprite {
  const n = SKETCHES.length
  const p = new Painter(IN, IN, n)
  for (let f = 0; f < n; f++) paint(p, f, SKETCHES[f])
  return {
    id, frameW: IN, frameH: IN, cols: n, frameCount: n,
    indices: p.data, anchor: { x: 8, y: 8 },
    animations: {
      idle: { se: STILL, ne: STILL }, walk: { se: STILL, ne: STILL },
      attack: { se: STILL, ne: STILL }, hit: { se: STILL, ne: STILL },
    },
  }
}

/** Emoji → UI icon, so existing emoji-labelled call sites resolve without migration. */
export const EMOJI_UI_ICON: Record<string, UiIconKey> = {
  '🔒': 'lock', '🔓': 'lock',
  '🗺': 'map', '🧭': 'travel', '✈': 'travel',
  '🔍': 'zoom', '🔎': 'zoom',
  '🪙': 'coin', '💰': 'coin',
  '🏆': 'trophy', '🥇': 'trophy',
  '⚠': 'warn', '❗': 'warn', '❕': 'warn',
  '🎲': 'dice',
  '✎': 'quill', '✏': 'quill', '📝': 'quill',
  '🎒': 'bag', '👜': 'bag',
}
