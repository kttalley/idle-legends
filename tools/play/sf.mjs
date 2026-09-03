#!/usr/bin/env node
// ── Safari, as a remote for the Play Console ─────────────────────────────────
//
//   node tools/play/sf.mjs tabs                 list tabs, mark the console one
//   node tools/play/sf.mjs goto <url>           navigate the console tab, wait for load
//   node tools/play/sf.mjs eval <file.js>       run a JS file in the console tab
//   echo "expr" | node tools/play/sf.mjs eval   ...or from stdin
//
// WHY SAFARI AND NOT CDP: the seven App-content declarations have no API, so they have to
// be clicked. Chrome 136+ refuses --remote-debugging-port on the default profile, and a
// fresh profile means a fresh Google login — which failed here, because the Play account
// is a different identity from the one the browser wanted to use. Safari already holds a
// live, authenticated console session, and AppleScript's `do JavaScript` reaches straight
// into it. No new profile, no second login, no automation fingerprint.
//
// Requires: Safari → Settings → Developer → "Allow JavaScript from Apple Events".
//
// JS is passed via a FILE rather than interpolated into the AppleScript source. AppleScript
// string escaping and JavaScript both want backslashes and double quotes, and nesting them
// produces bugs that look like console bugs. `read POSIX file` sidesteps the whole class:
// the script text never passes through an AppleScript literal.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CONSOLE_RE = /play\.google\.com\/console/
const scratch = mkdtempSync(join(tmpdir(), 'sf-'))

function osa(script) {
  try {
    return execFileSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim()
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().trim()
    if (/Allow JavaScript from Apple Events/.test(msg)) {
      die('Safari blocks this: enable Settings → Developer → "Allow JavaScript from Apple Events".')
    }
    throw new Error(msg)
  }
}

function die(m) { console.error(`\nerror: ${m}\n`); process.exit(1) }

/** Tab indices shift as tabs open and close, so never hard-code one — find it by URL. */
function findTab() {
  // NOT the AppleScript `tab` constant as a separator: inside `tell application "Safari"`,
  // `tab` resolves to Safari's own tab CLASS, and the whole expression silently evaluates
  // to a reference instead of text. Use an unambiguous literal.
  const raw = osa(`
    set out to ""
    tell application "Safari"
      repeat with i from 1 to (count of tabs of window 1)
        set out to out & i & "|::|" & (URL of tab i of window 1) & linefeed
      end repeat
    end tell
    return out`)
  const rows = raw.split('\n').filter(Boolean).map(l => {
    const [i, ...rest] = l.split('|::|')
    return { index: Number(i), url: rest.join('|::|') }
  })
  const hit = rows.find(r => CONSOLE_RE.test(r.url))
  if (!hit) die('no Play Console tab open in Safari window 1 — open one and retry.')
  return { hit, rows }
}

/**
 * Run JS in the console tab and return whatever it evaluates to.
 *
 * The caller is expected to JSON.stringify anything structured: AppleScript hands back a
 * flattened string, so an object would arrive as the useless "«class ocid»..." form.
 */
function evalInTab(js, index) {
  const f = join(scratch, 'snippet.js')
  writeFileSync(f, js)
  return osa(`
    set js to (read POSIX file "${f}" as «class utf8»)
    tell application "Safari" to return (do JavaScript js in tab ${index} of window 1)`)
}

const cmd = process.argv[2]

if (cmd === 'tabs') {
  const { hit, rows } = findTab()
  for (const r of rows) {
    console.log(`${String(r.index).padStart(2)}${r.index === hit.index ? ' *' : '  '} ${r.url.slice(0, 130)}`)
  }
  console.log(`\n* = the tab this tool drives (tab ${hit.index})`)

} else if (cmd === 'goto') {
  const url = process.argv[3] || die('goto needs a URL')
  const { hit } = findTab()
  osa(`tell application "Safari" to set URL of tab ${hit.index} of window 1 to "${url}"`)
  // Poll readyState rather than sleeping a fixed amount: the console is a heavy SPA and a
  // fixed wait is either wrong or slow. Still bounded, because a hung navigation must not
  // hang the run.
  for (let i = 0; i < 60; i++) {
    execFileSync('sleep', ['0.5'])
    try {
      if (evalInTab('document.readyState', hit.index) === 'complete') break
    } catch { /* mid-navigation, the tab can refuse briefly */ }
  }
  console.log(evalInTab('location.href', hit.index))

} else if (cmd === 'eval') {
  const src = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : readFileSync(0, 'utf8')
  const { hit } = findTab()
  const out = evalInTab(src, hit.index)
  console.log(out)

} else {
  console.log('usage: sf.mjs tabs | goto <url> | eval [file.js]')
}
