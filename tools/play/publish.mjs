#!/usr/bin/env node
// ── Google Play publishing, driven from the CLI ───────────────────────────────
//
//   node tools/play/publish.mjs <command> [options]
//
// The Play Console equivalent of the App Store Connect API work: everything Google
// actually exposes, so the browser session shrinks to the handful of forms that have no
// endpoint at all.
//
// WHAT THIS CAN DO (androidpublisher v3):
//   aab           upload an AAB to a track and commit
//   listing       title, descriptions, icon, feature graphic, screenshots, contact details
//   testers       replace a closed/internal track's tester email list
//   data-safety   POST the Data safety declaration (the CSV, as a string)
//   status        read back what Play currently holds, without changing anything
//
// WHAT NO API COVERS — these stay browser clicks, there is no endpoint for any of them:
//   Content rating (IARC), Target audience, Ads, App access / Sign in details,
//   Government apps, Financial features, Health.
//
// ── Setup, once ──────────────────────────────────────────────────────────────
// Needs a service account with Play Developer API access. This is the same credential
// RevenueCat needs (docs/ANDROID-PHASE0.md §6), and it carries a propagation delay of up
// to ~36h before purchases validate — so doing it for this script is not a detour.
//
//   1. Google Cloud console → create (or reuse) a project.
//   2. IAM → Service Accounts → create → Keys → Add key → JSON → download.
//   3. Play Console → Setup → API access → link that Cloud project, then grant the
//      service account "View app information" + "Manage orders and subscriptions"
//      (and "Release apps to testing tracks" for the `aab` command).
//   4. export PLAY_SERVICE_ACCOUNT_JSON=/path/to/key.json
//
// Deliberately dependency-free: the JWT is signed with node:crypto and every call is a
// bare fetch. Nothing here is worth adding googleapis (and its ~50 transitive packages)
// to a project whose whole dependency list is ten entries long.

import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const PACKAGE_NAME = 'com.stillmarch.game'
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Mint an access token from the service-account key.
 *
 * The two-legged JWT flow rather than a refresh token: there is no user to consent, the
 * key file IS the credential, and a token lives an hour — longer than any run here.
 */
async function getAccessToken() {
  const keyPath = process.env.PLAY_SERVICE_ACCOUNT_JSON
  if (!keyPath) {
    die('PLAY_SERVICE_ACCOUNT_JSON is unset — point it at the service-account JSON key.\n' +
        'See the setup notes at the top of this file.')
  }
  let key
  try {
    key = JSON.parse(readFileSync(keyPath, 'utf8'))
  } catch (e) {
    die(`could not read the service-account key at ${keyPath}: ${e.message}`)
  }
  if (!key.client_email || !key.private_key) {
    die(`${keyPath} does not look like a service-account key (no client_email / private_key)`)
  }

  const now = Math.floor(Date.now() / 1000)
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const claim = b64({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })
  const signingInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${claim}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key.private_key, 'base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    die(`token request failed (${res.status}): ${body.error_description || JSON.stringify(body)}\n` +
        'A 400 "invalid_grant" here usually means the service account is not yet granted\n' +
        'access in Play Console → Setup → API access, or the grant has not propagated.')
  }
  return body.access_token
}

// ── Transport ────────────────────────────────────────────────────────────────

let TOKEN = null

async function call(method, path, { body, query, raw, contentType, base = API } = {}) {
  const url = new URL(base + path)
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)
  const headers = { authorization: `Bearer ${TOKEN}` }
  let payload
  if (raw) {
    headers['content-type'] = contentType
    payload = raw
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(url, { method, headers, body: payload })
  const text = await res.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { /* some calls return no body */ }
  if (!res.ok) {
    const msg = parsed?.error?.message || text || `HTTP ${res.status}`
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`)
  }
  return parsed
}

// ── Edits ────────────────────────────────────────────────────────────────────
//
// Every listing/binary change happens inside an "edit": open one, mutate, commit. An edit
// that is never committed changes nothing, which is what makes --dry-run honest — it does
// the real work against the real API and then simply walks away.

async function withEdit(fn, { commit = true } = {}) {
  const edit = await call('POST', `/applications/${PACKAGE_NAME}/edits`)
  const id = edit.id
  console.log(`  edit ${id} opened`)
  try {
    const result = await fn(id)
    if (commit) {
      await call('POST', `/applications/${PACKAGE_NAME}/edits/${id}:commit`)
      console.log(`  edit ${id} committed`)
    } else {
      await call('DELETE', `/applications/${PACKAGE_NAME}/edits/${id}`).catch(() => {})
      console.log(`  edit ${id} discarded (dry run — nothing changed)`)
    }
    return result
  } catch (err) {
    // Leaving an edit open is harmless (they expire), but deleting keeps the console tidy
    // and avoids "another edit is in progress" confusion on the next run.
    await call('DELETE', `/applications/${PACKAGE_NAME}/edits/${id}`).catch(() => {})
    throw err
  }
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdStatus() {
  await withEdit(async (id) => {
    const listings = await call('GET', `/applications/${PACKAGE_NAME}/edits/${id}/listings`)
    const details = await call('GET', `/applications/${PACKAGE_NAME}/edits/${id}/details`)
    const tracks = await call('GET', `/applications/${PACKAGE_NAME}/edits/${id}/tracks`)
    console.log('\nDetails:', JSON.stringify(details, null, 2))
    for (const l of listings.listings || []) {
      console.log(`\nListing [${l.language}]`)
      console.log(`  title:  ${l.title}`)
      console.log(`  short:  ${l.shortDescription}`)
      console.log(`  full:   ${(l.fullDescription || '').slice(0, 120)}…`)
    }
    console.log('\nTracks:')
    for (const t of tracks.tracks || []) {
      const rel = (t.releases || []).map(r => `${r.name || '?'} [${r.status}] codes=${(r.versionCodes || []).join(',')}`)
      console.log(`  ${t.track}: ${rel.join(' | ') || '(no releases)'}`)
    }
  }, { commit: false })
}

async function cmdAab({ file, track, notes, dryRun, status }) {
  const aab = readFileSync(file)
  console.log(`  ${basename(file)} — ${(aab.length / 1024 / 1024).toFixed(1)} MB`)
  await withEdit(async (id) => {
    const bundle = await call('POST', `/applications/${PACKAGE_NAME}/edits/${id}/bundles`, {
      base: UPLOAD, raw: aab, contentType: 'application/octet-stream', query: { uploadType: 'media' },
    })
    console.log(`  uploaded versionCode ${bundle.versionCode} (sha1 ${bundle.sha1})`)
    await call('PUT', `/applications/${PACKAGE_NAME}/edits/${id}/tracks/${track}`, {
      body: {
        track,
        releases: [{
          name: `${bundle.versionCode} (${new Date().toISOString().slice(0, 10)})`,
          versionCodes: [String(bundle.versionCode)],
          status,
          releaseNotes: notes ? [{ language: 'en-US', text: notes }] : undefined,
        }],
      },
    })
    console.log(`  assigned to track "${track}" as ${status}`)
  }, { commit: !dryRun })
}

/**
 * Put an ALREADY-UPLOADED bundle onto another track.
 *
 * Not the same as `aab`, which uploads. A version code can sit on several tracks at once,
 * so moving the internal build to closed testing is a track update and nothing more —
 * re-uploading the same 10 MB bundle would also fail, since a version code can only be
 * uploaded once.
 *
 * Track names in the API are not the ones the console shows: `alpha` IS the closed testing
 * track and `beta` is open testing. Passing "closed" would 404.
 */
async function cmdPromote({ from, to, versionCode, notes, dryRun, status }) {
  await withEdit(async (id) => {
    if (!versionCode) {
      const src = await call('GET', `/applications/${PACKAGE_NAME}/edits/${id}/tracks/${from}`)
      const rel = (src.releases || []).find(r => (r.versionCodes || []).length)
      if (!rel) die(`track "${from}" has no release with a version code to promote`)
      versionCode = rel.versionCodes[rel.versionCodes.length - 1]
      console.log(`  found versionCode ${versionCode} on "${from}"`)
    }
    await call('PUT', `/applications/${PACKAGE_NAME}/edits/${id}/tracks/${to}`, {
      body: {
        track: to,
        releases: [{
          name: `${versionCode} (${new Date().toISOString().slice(0, 10)})`,
          versionCodes: [String(versionCode)],
          status,
          // NO countryTargeting here, deliberately: the API rejects it with "Country
          // targeting is only supported for staged releases", i.e. it is a property of a
          // percentage rollout, not of a draft or completed release. A testing track's
          // country availability is console-only — Testing → Closed testing → Countries.
          releaseNotes: notes ? [{ language: 'en-US', text: notes }] : undefined,
        }],
      },
    })
    console.log(`  versionCode ${versionCode} → track "${to}" as ${status}`)
  }, { commit: !dryRun })
}

/** Store listing text + every image slot, from store/PLAY-LISTING.md's decided values. */
async function cmdListing({ dryRun }) {
  const root = new URL('../..', import.meta.url).pathname
  const listing = {
    language: 'en-US',
    title: 'Stillmarch: Idle MMORPG',
    shortDescription: 'Offline idle RPG. Real shared world, skill trees, heroes march while you sleep.',
    fullDescription: readFileSync(`${root}store/play-full-description.txt`, 'utf8').trim(),
  }
  for (const [field, limit] of [['title', 30], ['shortDescription', 80], ['fullDescription', 4000]]) {
    if (listing[field].length > limit) {
      die(`${field} is ${listing[field].length}/${limit} — Play will reject it`)
    }
    console.log(`  ${field}: ${listing[field].length}/${limit}`)
  }

  // imageType → file. Play's slots are fixed names; screenshots are additive per call, so
  // the existing set is deleted first to make the script idempotent rather than cumulative.
  const images = {
    icon: [`${root}store/icon-512-play-alpha.png`],
    featureGraphic: [`${root}store/feature-graphic-play.png`],
    phoneScreenshots: [
      '01-create', '02-world', '03-combat', '04-hero', '05-ladder', '06-wardrobe',
    ].map(n => `${root}store/screenshots-play/${n}.png`),
  }

  await withEdit(async (id) => {
    await call('PUT', `/applications/${PACKAGE_NAME}/edits/${id}/listings/en-US`, { body: listing })
    console.log('  listing text set')

    await call('PATCH', `/applications/${PACKAGE_NAME}/edits/${id}/details`, {
      body: {
        contactEmail: 'talleykristian@gmail.com',
        contactWebsite: 'https://design.kristiantalley.com/stillmarch/privacy/',
        defaultLanguage: 'en-US',
      },
    })
    console.log('  contact details set')

    // Images hang off the LISTINGS path, not an /images/ one — `edits.images.upload` is
    // `POST .../edits/{editId}/listings/{language}/{imageType}`. Using /images/ returns a
    // 404 "Could not find handler for this request", which reads like a missing permission
    // and is not.
    for (const [imageType, files] of Object.entries(images)) {
      await call('DELETE',
        `/applications/${PACKAGE_NAME}/edits/${id}/listings/en-US/${imageType}`).catch(() => {})
      for (const f of files) {
        await call('POST', `/applications/${PACKAGE_NAME}/edits/${id}/listings/en-US/${imageType}`, {
          base: UPLOAD, raw: readFileSync(f), contentType: 'image/png', query: { uploadType: 'media' },
        })
        console.log(`  ${imageType} ← ${basename(f)}`)
      }
    }
  }, { commit: !dryRun })
}

/**
 * Attach Google Groups to a track's tester list.
 *
 * GROUPS ONLY. The console lets you paste individual email addresses, but the API does
 * not: the Testers resource is `{ googleGroups: [string] }` and nothing else — Google's
 * own reference says "while it is possible in the Play Console UI to add testers via email
 * lists, email lists are not supported by this resource." An earlier version of this
 * command sent a `testerEmails` field, which simply is not part of the schema.
 *
 * That constraint is a feature here. A group means tester churn is handled in Google
 * Groups rather than in Play Console, and the 12-testers-for-14-days clock is measured per
 * tester opt-in either way — so swapping a straggler out never touches the release.
 */
async function cmdTesters({ track, file, dryRun }) {
  const groups = readFileSync(file, 'utf8')
    .split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  if (!groups.length) die(`${file} lists no Google Groups`)
  if (groups.some(g => !g.includes('@'))) die('each line must be a Google Group email address')
  console.log(`  ${groups.length} group(s) for track "${track}": ${groups.join(', ')}`)
  if (track !== 'internal') {
    console.log('  ⚠ Play needs 12 testers opted in CONTINUOUSLY for 14 days before you can')
    console.log('    apply for production. Put 14–15 in the group: the clock restarts per')
    console.log('    tester on opt-out, and one straggler moves the date one-for-one.')
  }
  await withEdit(async (id) => {
    await call('PUT', `/applications/${PACKAGE_NAME}/edits/${id}/testers/${track}`,
      { body: { googleGroups: groups } })
    console.log('  tester groups set')
  }, { commit: !dryRun })
}

/**
 * The Data safety declaration.
 *
 * Not part of the edit lifecycle — it is a direct POST on the application, and it takes
 * the SAME CSV the Console's "Import to CSV" accepts, passed as a string. Download the
 * template from Play Console → App content → Data safety → Start → Import to CSV, fill in
 * the "Response value" column, and hand the file to this command.
 *
 * The template is generated per app with Google's own question identifiers, which is why
 * this takes a file rather than generating one: an invented CSV does not import.
 */
async function cmdDataSafety({ file, dryRun }) {
  const csv = readFileSync(file, 'utf8')
  const rows = csv.split('\n').filter(r => r.trim()).length
  console.log(`  ${basename(file)} — ${rows} rows`)
  if (dryRun) {
    console.log('  dry run — not posting')
    return
  }
  await call('POST', `/applications/${PACKAGE_NAME}/dataSafety`, { body: { safetyLabels: csv } })
  console.log('  data safety declaration accepted')
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
const has = (name) => process.argv.includes(`--${name}`)

const USAGE = `
Google Play publishing — ${PACKAGE_NAME}

  node tools/play/publish.mjs status
  node tools/play/publish.mjs aab --file <path.aab> [--track internal] [--status draft|completed]
  node tools/play/publish.mjs promote --from internal --to alpha   # alpha = CLOSED testing
  node tools/play/publish.mjs listing
  node tools/play/publish.mjs testers --track alpha --file groups.txt  # Google Groups only
  node tools/play/publish.mjs data-safety --file datasafety.csv

  --dry-run   do everything except commit (the edit is opened and discarded)

Requires PLAY_SERVICE_ACCOUNT_JSON. These forms have NO API and must be clicked:
Content rating, Target audience, Ads, App access, Government apps, Financial
features, Health.
`

const command = process.argv[2]
if (!command || has('help')) { console.log(USAGE); process.exit(0) }

const dryRun = has('dry-run')
TOKEN = await getAccessToken()
console.log(`authenticated${dryRun ? ' (dry run)' : ''}`)

try {
  switch (command) {
    case 'status':
      await cmdStatus(); break
    case 'aab':
      await cmdAab({
        file: arg('file') || die('--file is required'),
        track: arg('track', 'internal'),
        status: arg('status', 'draft'),
        notes: arg('notes', 'First release of Stillmarch — offline idle RPG with a real shared ' +
          'world, skill trees, and a hero that keeps marching while you sleep.'),
        dryRun,
      }); break
    case 'promote':
      await cmdPromote({
        from: arg('from', 'internal'),
        to: arg('to', 'alpha'),
        versionCode: arg('version'),
        status: arg('status', 'completed'),
        notes: arg('notes', 'First closed test of Stillmarch — offline idle RPG with a real ' +
          'shared world, skill trees, and a hero that keeps marching while you sleep.'),
        dryRun,
      }); break
    case 'listing':
      await cmdListing({ dryRun }); break
    case 'testers':
      await cmdTesters({
        track: arg('track') || die('--track is required'),
        file: arg('file') || die('--file is required'),
        dryRun,
      }); break
    case 'data-safety':
      await cmdDataSafety({ file: arg('file') || die('--file is required'), dryRun }); break
    default:
      die(`unknown command "${command}"\n${USAGE}`)
  }
} catch (err) {
  die(err.message)
}
console.log('done.')
