// ── The music track ───────────────────────────────────────────────────────────
//
// A single looping piece: the game's only sound since 2026-10-11, when the procedural
// ambience bed, the weather noise and the generative/stinger engine were removed (see the
// header of audioEngine.ts).
//
// ── Why Web Audio and not an <audio> tag ─────────────────────────────────────
// Anything that makes sound has to share ONE AudioContext and ONE master gain,
// or the mute switch and the volume slider only govern some of the sound. An `<audio>`
// element is outside that graph and would keep playing at its own level through a mute.
// It also would not be governed by the iOS gesture latch, so it would fail to start on the
// device and work perfectly in the simulator — the worst kind of bug to chase.
//
// Decoded into an AudioBuffer rather than streamed, for looping: an
// `AudioBufferSourceNode` with `loop = true` repeats inside the audio thread with no
// scheduling gap, whereas an element's `loop` attribute re-seeks on the main thread and
// audibly stutters on a slow frame.

import { getAudioContext, getMusicInput, onMusicElementPlayback } from './audioEngine'

/** Published under `public/`, so it ships with both the web build and the iOS bundle. */
const TRACK_URL = `${import.meta.env.BASE_URL}audio/theme.mp3`

/**
 * The track's level under the master volume. It was set when the track shared the mix with
 * the ambience bed, and is unchanged so that removing the bed doesn't make the music louder.
 */
const TRACK_GAIN = 0.7

/** Just long enough to avoid a click; the music is meant to simply be there. */
const RAMP_S = 0.3

/**
 * How early each pass starts before the previous one ends, in seconds.
 *
 * The recording ends on a ~2 s natural decay and opens on a ~0.5 s swell, so restarting
 * exactly at the end leaves a dip, and the file's trailing silence (4.5 s of it, until
 * 2026-10-12) left an outright gap. Overlapping the next pass over the tail turns the seam
 * into a short crossfade the recording supplies itself.
 */
const OVERLAP_S = 1.2

/** Below this a sample counts as silence when finding where the music starts and ends. */
const SILENCE = 10 ** (-60 / 20)

let buffer: AudioBuffer | null = null
let source: AudioBufferSourceNode | null = null
let element: HTMLAudioElement | null = null
let gain: GainNode | null = null
/** Which mechanism is actually producing sound, for the on-device diagnostic. */
let mode: 'none' | 'buffer' | 'element' | 'failed' = 'none'
/** Why the preferred path failed, if it did. */
let lastError: string | null = null
/** Pending timer that schedules the next pass, so stopping can cancel it. */
let passTimer: number | null = null
/** Where the music actually starts and ends inside the buffer, in seconds. */
let musicStart = 0
let musicEnd = 0

/** Guards against two overlapping starts — a second copy of the same track playing a few
 *  hundred ms out of phase with the first is a flanged mess, and it is the exact failure a
 *  double `latch()` or a fast restart would produce. */
let starting = false

/**
 * Fetch and decode the track. Safe to call repeatedly; the decode happens once.
 *
 * Never throws. A missing or unplayable file means no music, which is a strictly better
 * outcome than a boot that fails — the same rule the rest of the audio engine follows.
 */
export async function initMusicTrack(): Promise<void> {
  if (buffer) return
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const res = await fetch(TRACK_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${TRACK_URL}`)
    const bytes = await res.arrayBuffer()
    // `decodeAudioData` detaches the ArrayBuffer it is handed, so this can only be done
    // once per fetch — hence the `buffer` cache rather than decoding per start.
    buffer = await ctx.decodeAudioData(bytes)
    measureMusic(buffer)
    lastError = null
  } catch (e) {
    // Recorded rather than swallowed. This path went silent on device while the biome bed
    // played perfectly, and a console warning nobody can read on a phone is indistinguish-
    // able from no diagnostic at all.
    lastError = (e as { message?: string })?.message ?? String(e)
    console.warn('[music] buffer path failed:', lastError)
  }
}

/**
 * Start the loop, fading in. No-op if it is already playing.
 *
 * ── Two mechanisms, in order of preference ───────────────────────────────────
 * The decoded-buffer path loops seamlessly and is tried first. If it fails — and on device
 * it did, silently, while every other layer of the audio graph kept playing — the track is
 * handed to an `<audio>` element instead and that element is patched into the SAME master
 * gain via `createMediaElementSource`, so mute and volume still govern it.
 *
 * The element path is a genuinely different mechanism, not a retry: the browser's media
 * loader fetches and decodes it internally, streaming rather than decoding 1.3 MB up front.
 * Its looping is marginally less tight, which is the right thing to trade for audible.
 */
export async function startMusicTrack(): Promise<void> {
  if (source || element || starting) return
  starting = true
  try {
    const ctx = getAudioContext()
    const master = getMusicInput()
    if (!ctx || !master) return

    gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(TRACK_GAIN, ctx.currentTime + RAMP_S)
    gain.connect(master)

    await initMusicTrack()
    if (buffer) {
      mode = 'buffer'
      schedulePass(ctx.currentTime + 0.05)
      return
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    try {
      const el = new Audio(TRACK_URL)
      // The element can't overlap passes, so it loops the whole (trimmed) file; the seam
      // is a little less smooth than the buffer path's, which is the fallback's trade.
      el.loop = true
      el.preload = 'auto'
      // Required for `createMediaElementSource` to be allowed to read the samples. The file
      // is same-origin so this is a formality, but WKWebView is stricter about it.
      el.crossOrigin = 'anonymous'
      const node = ctx.createMediaElementSource(el)
      node.connect(gain)
      await el.play()
      element = el
      mode = 'element'
      console.info('[music] playing via the media-element fallback')
    } catch (e) {
      mode = 'failed'
      lastError = `${lastError ?? ''} | element: ${(e as { message?: string })?.message ?? String(e)}`.trim()
      console.warn('[music] both paths failed:', lastError)
      try { gain.disconnect() } catch { /* already gone */ }
      gain = null
    }
  } finally {
    starting = false
  }
}

// The element fallback is paused and resumed with the app; see onMusicElementPlayback.
onMusicElementPlayback(playing => {
  if (!element) return
  if (playing) void element.play().catch(() => { /* resumes on the next start */ })
  else element.pause()
})

/** Find where the music starts and ends, ignoring leading and trailing silence. */
function measureMusic(buf: AudioBuffer): void {
  const data = buf.getChannelData(0)
  let first = 0, last = data.length - 1
  while (first < last && Math.abs(data[first]) < SILENCE) first++
  while (last > first && Math.abs(data[last]) < SILENCE) last--
  musicStart = first / buf.sampleRate
  musicEnd = (last + 1) / buf.sampleRate
}

/**
 * Play one pass of the music at `at` (audio-clock seconds), and arrange the next pass to
 * start OVERLAP_S before this one ends.
 *
 * Start times are absolute on the audio clock, so they are sample-accurate however late
 * the timer fires; the timer only has to run before the next pass is due, and it is set
 * to fire several seconds early to make sure it does.
 */
function schedulePass(at: number): void {
  const ctx = getAudioContext()
  if (!ctx || !buffer || !gain || mode !== 'buffer') return
  const length = musicEnd - musicStart
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(gain)
  src.start(at, musicStart, length)
  src.onended = () => { try { src.disconnect() } catch { /* gone */ } }
  source = src
  const next = at + Math.max(1, length - OVERLAP_S)
  const lead = Math.max(0, (next - ctx.currentTime - 5) * 1000)
  passTimer = window.setTimeout(() => { passTimer = null; schedulePass(next) }, lead)
}

/** What the music layer is doing, and why, for an on-device diagnostic. */
export function musicDiagnostic(): { mode: string; error: string | null; url: string } {
  return { mode, error: lastError, url: TRACK_URL }
}

/** Fade out and stop. Safe to call when nothing is playing. The game itself no longer
 *  stops the music (it plays through character select); this is for tests and teardown. */
export function stopMusicTrack(): void {
  const ctx = getAudioContext()
  if (passTimer !== null) { window.clearTimeout(passTimer); passTimer = null }
  const s = source, g = gain, el = element
  source = null
  gain = null
  element = null
  mode = 'none'
  if (el) {
    // The element path has no scheduled stop; pause it and let the gain ramp cover the tail.
    window.setTimeout(() => { try { el.pause() } catch { /* gone */ } }, RAMP_S * 1000)
  }
  if (!s) {
    if (g && ctx) {
      const t0 = ctx.currentTime
      g.gain.cancelScheduledValues(t0)
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t0)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + RAMP_S)
    }
    return
  }
  if (!ctx || !g) { try { s.stop() } catch { /* already stopped */ } return }
  const t = ctx.currentTime
  g.gain.cancelScheduledValues(t)
  // Read the CURRENT value before ramping. Ramping from a scheduled-but-not-reached value
  // makes a fade that starts by jumping to full volume — audible every time the player
  // returns to character select during the opening fade-in.
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + RAMP_S)
  try { s.stop(t + RAMP_S) } catch { /* already stopped */ }
  // Disconnect only after the ramp has actually run, or the node is torn out of the graph
  // mid-fade and the fade becomes a cut.
  window.setTimeout(() => { try { g.disconnect() } catch { /* gone */ } }, (RAMP_S + 0.2) * 1000)
}

/** True while the track is playing — the renderer has no use for this; tests do. */
export function isMusicPlaying(): boolean {
  return source != null || element != null
}

/**
 * Test seam: report what the track layer is actually doing, so a headless driver can tell
 * "loaded and playing" from "never even fetched". Stripped from release builds by the
 * `import.meta.env.DEV` guard, exactly like the purchase seams in monetization/purchases.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __ilMusic?: () => unknown }).__ilMusic = () => ({
    decoded: buffer != null,
    seconds: buffer?.duration ?? null,
    playing: source != null || element != null,
    mode,
    error: lastError,
    starting,
    ctx: getAudioContext()?.state ?? null,
    url: TRACK_URL,
  })
}
