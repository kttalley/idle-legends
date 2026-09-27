#!/usr/bin/env node
// ── App Store Connect, driven from the CLI ───────────────────────────────────
//
//   node tools/asc/appstore.mjs <command> [options]
//
// The Apple counterpart to tools/play/publish.mjs. Everything App Store Connect
// exposes as an API, so the browser session shrinks to the handful of screens that
// have no endpoint at all.
//
// WHAT THIS CAN DO:
//   status            read back the live App Store state — version, build, IAPs,
//                     territories, ratings, open review submissions
//   analytics init    create the analytics report requests (once per app, ever)
//   analytics pull    download the acquisition funnel — impressions, page views,
//                     downloads, redownloads
//   sales             daily sales rows — downloads and IAPs by product and country,
//                     with customer price and developer proceeds
//
// WHAT NO API COVERS — these stay browser clicks:
//   Submitting for review (the version record is owned by the review submission —
//   see store/RESUBMIT.md §0), attaching IAPs to a submission, replying in
//   Resolution Center, and uploading review screen recordings.
//
// ── Setup, once ──────────────────────────────────────────────────────────────
// Needs an App Store Connect API key at ~/.appstoreconnect/private_keys/, mode 600 —
// the same directory altool searches, so one key serves both uploads and this script.
//
//   App Store Connect → Users and Access → Integrations → App Store Connect API
//
// The two keys on this account have COMPLEMENTARY, not overlapping, access — measured
// against the live API on 2026-09-04:
//
//                    WB8UYW46J7   D4A8J64VJ9
//   appInfos            200          403        app-management role
//   inAppPurchasesV2    200          403
//   reviewSubmissions   200          403
//   analytics (GET)     403          200        reports-flavoured role
//   analytics (POST)    403          403        ← neither can create a request
//   salesReports        403          200        measured 2026-09-27
//
// So `status` runs on WB8UYW46J7 (the default), `sales` defaults to D4A8J64VJ9, and `analytics` needs a key that can
// POST /v1/analyticsReportRequests — which neither currently can. Creating a report
// request needs the ADMIN role; note /v1/users is NOT a test for Admin, it answers
// 200 for lesser roles too and will mislead you.
//
// A 403 FORBIDDEN_ERROR "The API key in use does not allow this request" is a role
// problem every time. It is never the Accept header, whatever the forums say — that
// was tested here with */*, application/json and none, all identical.
//
//   export ASC_KEY_ID=XXXXXXXXXX      # defaults to WB8UYW46J7, which `status` needs
//   export ASC_ISSUER_ID=…            # defaults to the team issuer below
//
// Deliberately dependency-free, like the Play script: node:crypto signs the JWT and
// every call is a bare fetch.

import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { homedir } from 'node:os'

const APP_ID = '6800207310'
const API = 'https://api.appstoreconnect.apple.com'
const KEY_ID = process.env.ASC_KEY_ID || (process.argv[2] === 'sales' ? 'D4A8J64VJ9' : 'WB8UYW46J7')
// Not in any API response — read it off Payments and Financial Reports, top left.
const VENDOR_NUMBER = '94681248'
const ISSUER_ID = process.env.ASC_ISSUER_ID || '4f36dcad-26a1-4d94-b063-d7f2fae9a5e0'

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Mint a JWT for the App Store Connect API.
 *
 * ES256 over the P-256 key. Node's sign() hands back a DER-wrapped signature by
 * default; JOSE wants the bare r‖s pair, and `dsaEncoding: 'ieee-p1363'` is exactly
 * that — it saves parsing the DER by hand, which is where most hand-rolled ASC
 * clients go wrong.
 */
function mintToken() {
  const path = `${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`
  let key
  try {
    key = readFileSync(path, 'utf8')
  } catch (e) {
    die(`could not read the API key at ${path}: ${e.message}\n` +
        'Apple allows exactly one download of a key; there is no re-download, only\n' +
        'revoke-and-reissue. See store/UPLOAD.md.')
  }
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const signingInput =
    `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.` +
    `${b64({ iss: ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })}`
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url')
  return `${signingInput}.${signature}`
}

// ── Transport ────────────────────────────────────────────────────────────────

let TOKEN = null

async function call(path, { method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : API + path
  const headers = { authorization: `Bearer ${TOKEN}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(url, { method, headers, body: body && JSON.stringify(body) })
  const text = await res.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { /* segments are gzip, not JSON */ }
  if (!res.ok) {
    const err = parsed?.errors?.[0]
    if (res.status === 403) {
      throw new Error(
        `${method} ${path} → 403 ${err?.detail || ''}\n` +
        `  Key ${KEY_ID} lacks the role for this endpoint. The keys on this account have\n` +
        '  complementary access — see the matrix in the setup notes. Try ASC_KEY_ID=<other>.')
    }
    throw new Error(`${method} ${path} → ${res.status}: ${err?.detail || text || 'no body'}`)
  }
  return parsed
}

/** Walk every page of a collection, following the `next` link. */
async function all(path) {
  const out = []
  let next = path
  while (next) {
    const page = await call(next)
    out.push(...(page.data ?? []))
    next = page.links?.next
  }
  return out
}

// ── status ───────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const app = (await call(`/v1/apps/${APP_ID}`)).data
  console.log(`\n${app.attributes.name}  (${app.attributes.bundleId})`)
  console.log(`  app id ${APP_ID} · SKU ${app.attributes.sku} · ${app.attributes.primaryLocale}`)

  const info = (await call(`/v1/apps/${APP_ID}/appInfos?limit=1`)).data[0]
  if (info) console.log(`  age rating ${info.attributes.appStoreAgeRating} · state ${info.attributes.state}`)

  console.log('\nVERSIONS')
  const versions = (await call(`/v1/apps/${APP_ID}/appStoreVersions?limit=10`)).data
  for (const v of versions) {
    const a = v.attributes
    console.log(`  ${a.versionString.padEnd(8)} ${a.appStoreState.padEnd(22)} ` +
                `${a.downloadable ? 'downloadable' : 'not downloadable'} · created ${a.createdDate?.slice(0, 10)}`)
    let build = null
    try { build = (await call(`/v1/appStoreVersions/${v.id}/build`)).data } catch { /* none attached */ }
    console.log(`           build ${build ? `${build.attributes.version} (uploaded ${build.attributes.uploadedDate?.slice(0, 10)})` : '— none attached'}`)
  }

  console.log('\nIN-APP PURCHASES')
  for (const p of (await call(`/v1/apps/${APP_ID}/inAppPurchasesV2?limit=20`)).data) {
    const a = p.attributes
    console.log(`  ${a.state.padEnd(18)} ${a.name} (${a.productId})`)
  }

  console.log('\nREVIEW SUBMISSIONS')
  const subs = (await call(`/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=20`)).data
  for (const s of subs) {
    const items = (await call(`/v1/reviewSubmissions/${s.id}/items?limit=20`)).data
    const flag = s.attributes.state === 'READY_FOR_REVIEW' && items.length === 0 ? '  ← stale, holds no items' : ''
    console.log(`  ${s.attributes.state.padEnd(20)} ${items.length} item(s) · ` +
                `${s.attributes.submittedDate?.slice(0, 10) ?? 'never submitted'} · ${s.id}${flag}`)
  }

  // Territories hang off appAvailabilityV2 by relationship link, not a nestable path —
  // the obvious /appAvailabilityV2/availableTerritories URL is a 404.
  const availability = (await call(`/v1/apps/${APP_ID}/appAvailabilityV2`)).data
  const terr = await all(`${availability.relationships.territoryAvailabilities.links.related}?limit=200`)
  const live = terr.filter((t) => t.attributes?.available)
  console.log(`\nAVAILABILITY\n  ${live.length} of ${terr.length} territories available` +
              `${availability.attributes?.availableInNewTerritories ? ' · auto-adds new territories' : ''}`)

  const reviews = await call(`/v1/apps/${APP_ID}/customerReviews?limit=200&sort=-createdDate`)
  const total = reviews.meta?.paging?.total ?? reviews.data.length
  console.log(`\nCUSTOMER REVIEWS\n  ${total} total`)
  if (total > 0) {
    const avg = reviews.data.reduce((n, r) => n + r.attributes.rating, 0) / reviews.data.length
    console.log(`  average ${avg.toFixed(2)}★ over the ${reviews.data.length} most recent`)
    for (const r of reviews.data.slice(0, 5)) {
      const a = r.attributes
      console.log(`  ${'★'.repeat(a.rating).padEnd(5)} ${a.territory} ${a.createdDate.slice(0, 10)} — ${a.title}`)
    }
  }
  console.log()
}

// ── analytics ────────────────────────────────────────────────────────────────
//
// Apple's analytics is asynchronous by design: you register a standing request, then
// Apple generates report *instances* on its own schedule. Data does not appear the
// moment you ask — the first instances typically land a day or two later, so `init`
// once and `pull` from then on.

async function cmdAnalyticsInit() {
  const existing = (await call(`/v1/apps/${APP_ID}/analyticsReportRequests?limit=10`)).data
  const have = new Set(existing.map((r) => r.attributes.accessType))
  console.log(`  ${existing.length} existing request(s): ${[...have].join(', ') || 'none'}`)

  for (const accessType of ['ONE_TIME_SNAPSHOT', 'ONGOING']) {
    if (have.has(accessType)) {
      console.log(`  ${accessType} already registered — skipping`)
      continue
    }
    const created = await call('/v1/analyticsReportRequests', {
      method: 'POST',
      body: {
        data: {
          type: 'analyticsReportRequests',
          attributes: { accessType },
          relationships: { app: { data: { type: 'apps', id: APP_ID } } },
        },
      },
    })
    console.log(`  ${accessType} created → ${created.data.id}`)
  }
  console.log('\n  Apple generates the first instances asynchronously, usually within a day or\n' +
              '  two. Run `analytics pull` after that.')
}

/** Fetch one report instance's segments and return the parsed TSV rows. */
async function fetchRows(instanceId) {
  const segments = (await call(`/v1/analyticsReportInstances/${instanceId}/segments`)).data
  const rows = []
  for (const seg of segments) {
    const res = await fetch(seg.attributes.url)          // pre-signed; no auth header
    const buf = Buffer.from(await res.arrayBuffer())
    // Segments are gzipped TSV. Apple has served both gzip and plain; sniff the magic.
    const text = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString('utf8')
    const [header, ...lines] = text.trim().split('\n')
    const cols = header.split('\t')
    for (const line of lines) {
      const cells = line.split('\t')
      rows.push(Object.fromEntries(cols.map((c, i) => [c, cells[i]])))
    }
  }
  return rows
}

async function cmdAnalyticsPull({ days }) {
  const requests = (await call(`/v1/apps/${APP_ID}/analyticsReportRequests?limit=10`)).data
  if (!requests.length) die('no analytics report requests exist yet — run `analytics init` first')

  for (const req of requests) {
    console.log(`\nrequest ${req.id} (${req.attributes.accessType})`)
    const reports = await all(`/v1/analyticsReportRequests/${req.id}/reports?limit=200`)
    if (!reports.length) {
      console.log('  no reports generated yet — Apple is still preparing them')
      continue
    }
    // The acquisition funnel lives in the App Store engagement reports.
    const wanted = reports.filter((r) => /discovery|engagement|download|installation/i.test(r.attributes.name))
    console.log(`  ${reports.length} report(s), ${wanted.length} relevant:`)
    for (const rep of wanted) {
      const instances = (await call(
        `/v1/analyticsReports/${rep.id}/instances?filter[granularity]=DAILY&limit=${days}`)).data
      console.log(`\n  ── ${rep.attributes.name} (${rep.attributes.category})`)
      if (!instances.length) { console.log('     no daily instances yet'); continue }
      for (const inst of instances.slice(0, days)) {
        const rows = await fetchRows(inst.id)
        console.log(`     ${inst.attributes.processingDate}: ${rows.length} rows`)
        if (rows.length) console.log(`       columns: ${Object.keys(rows[0]).join(', ')}`)
      }
    }
  }
  console.log()
}

// ── sales ────────────────────────────────────────────────────────────────────
//
// SUMMARY rows aggregate by product × country × device, so there is no buyer identity
// here — nor anywhere Apple exposes. Daily reports lag about a day (Americas by 5 am
// PT); a day not yet published is a 404, reported rather than fatal. Report days
// don't line up exactly with the Analytics dashboard's days.

const PRODUCT_TYPES = { '1F': 'download', '3F': 'redownload', '7F': 'update', IA1: 'IAP', IAY: 'sub', IAC: 'sub' }

async function cmdSales({ days }) {
  let units = 0
  const proceeds = {}
  for (let i = days; i >= 1; i--) {
    const date = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10)
    const url = `${API}/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES` +
      `&filter[reportSubType]=SUMMARY&filter[version]=1_1&filter[vendorNumber]=${VENDOR_NUMBER}` +
      `&filter[reportDate]=${date}`
    const res = await fetch(url, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/a-gzip' } })
    const buf = Buffer.from(await res.arrayBuffer())
    if (res.status === 404) { console.log(`  ${date}  not published yet (or no activity)`); continue }
    if (!res.ok) {
      const detail = JSON.parse(buf.toString()).errors?.[0]?.detail
      throw new Error(`salesReports ${date} → ${res.status}: ${detail}` +
        (res.status === 403 ? `\n  Key ${KEY_ID} can't read sales; D4A8J64VJ9 can.` : ''))
    }
    const [header, ...lines] = gunzipSync(buf).toString('utf8').trim().split('\n')
    const cols = header.split('\t')
    for (const line of lines) {
      const r = Object.fromEntries(cols.map((c, j) => [c, line.split('\t')[j]?.trim()]))
      const kind = PRODUCT_TYPES[r['Product Type Identifier']] ?? r['Product Type Identifier']
      const money = Number(r['Developer Proceeds']) > 0
        ? `  ${r['Customer Price']} ${r['Customer Currency']} → ${r['Developer Proceeds']} ${r['Currency of Proceeds']}`
        : ''
      console.log(`  ${date}  ${kind.padEnd(10)} ${r.Units.padStart(3)}× ${r.Title}  ` +
                  `${r['Country Code']} ${r.Device}${money}`)
      if (kind === 'IAP' || kind === 'sub') units += Number(r.Units)
      const cur = r['Currency of Proceeds']
      if (cur) proceeds[cur] = (proceeds[cur] ?? 0) + Number(r['Developer Proceeds']) * Number(r.Units)
    }
  }
  const total = Object.entries(proceeds).map(([c, v]) => `${v.toFixed(2)} ${c}`).join(' + ') || '0'
  console.log(`\n  ${units} purchase(s) · proceeds ${total} over ${days} day(s)\n`)
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`\nerror: ${msg}\n`)
  process.exit(1)
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

const USAGE = `usage:
  node tools/asc/appstore.mjs status
  node tools/asc/appstore.mjs analytics init
  node tools/asc/appstore.mjs analytics pull [--days 7]
  node tools/asc/appstore.mjs sales [--days 7]`

const command = process.argv[2]
const sub = process.argv[3]

TOKEN = mintToken()

try {
  switch (command) {
    case 'status':
      await cmdStatus(); break
    case 'sales':
      await cmdSales({ days: Number(arg('days', 7)) }); break
    case 'analytics':
      if (sub === 'init') await cmdAnalyticsInit()
      else if (sub === 'pull') await cmdAnalyticsPull({ days: Number(arg('days', 7)) })
      else die(`unknown analytics subcommand "${sub ?? ''}"\n${USAGE}`)
      break
    default:
      die(`unknown command "${command ?? ''}"\n${USAGE}`)
  }
} catch (err) {
  die(err.message)
}
