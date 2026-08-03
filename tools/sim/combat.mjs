// Gate for the STORE's combat path.
//
// `fight.mjs` proves `engine/fight.ts` still resolves a fight the way it did yesterday.
// Nothing did that for `gameStore.tick`, which is where the player's actual combat lives —
// so a refactor there was checked only against aggregate gold, and aggregate gold cannot
// tell a faithful extraction from one that changed a formula by a few percent.
//
// Exit code IS meaningful here (unlike run.mjs --assert, which always exits 0).
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const GOLDEN = new URL('./golden/store-combat-golden.txt', import.meta.url).pathname
const update = process.argv.includes('--update')

const run = spawnSync(process.execPath,
  [new URL('./run.mjs', import.meta.url).pathname, '--combat-trace'],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
if (run.status !== 0) {
  process.stdout.write(run.stderr || 'combat-trace run failed\n')
  process.exit(1)
}
const actual = run.stdout

if (update) {
  mkdirSync(dirname(GOLDEN), { recursive: true })
  writeFileSync(GOLDEN, actual)
  process.stdout.write(`store combat baseline written: ${GOLDEN}\n`)
  process.stdout.write(`  ${actual.split('\n').length} lines\n`)
  process.exit(0)
}

if (!existsSync(GOLDEN)) {
  process.stdout.write('NO BASELINE — run with --update to record one.\n')
  process.exit(1)
}
const expected = readFileSync(GOLDEN, 'utf8')
if (expected === actual) {
  process.stdout.write(`PASS — store combat golden matched (${actual.split('\n').length} lines)\n`)
  process.exit(0)
}
const e = expected.split('\n'), a = actual.split('\n')
let shown = 0
process.stdout.write('CHANGED — the store\'s combat path resolves differently\n\n')
for (let i = 0; i < Math.max(e.length, a.length) && shown < 6; i++) {
  if (e[i] === a[i]) continue
  let ctx = ''
  for (let k = i; k >= 0; k--) if (e[k]?.startsWith('## ')) { ctx = e[k].slice(3); break }
  process.stdout.write(`line ${i + 1}${ctx ? `  (in ${ctx})` : ''}\n  golden: ${e[i] ?? '<eof>'}\n  now:    ${a[i] ?? '<eof>'}\n\n`)
  shown++
}
process.stdout.write('If intended, regenerate with --update and review the diff.\n')
process.exit(1)
