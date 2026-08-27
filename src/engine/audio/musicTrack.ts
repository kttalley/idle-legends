// ── The music track ───────────────────────────────────────────────────────────
//
// A single looping piece, replacing the generative layer for the first release.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// `generativeEngine.ts` (Tone.js — zone grammar, world signals, tile reactivity) is still
// in the tree and still wired to everything that feeds it, but it does not currently
// produce music worth shipping. Rather than hold the release on retuning a live generative
// system, the first release plays one authored track and the generative engine simply is
// not started. Nothing is deleted: `initGenerative` is a dynamic import, so an engine that
// is never started never even loads its chunk, and turning it back on is one call site.
//
// ── Why Web Audio and not an <audio> tag ─────────────────────────────────────
// The bed, the stingers and this all have to share ONE AudioContext and ONE master gain,
// or the mute switch and the volume slider only govern some of the sound. An `<audio>`
// element is outside that graph and would keep playing at its own level through a mute.
// It also would not be governed by the iOS gesture latch, so it would fail to start on the
// device and work perfectly in the simulator — the worst kind of bug to chase.
//
// Decoded into an AudioBuffer rather than streamed, for looping: an
// `AudioBufferSourceNode` with `loop = true` repeats inside the audio thread with no
// scheduling gap, whereas an element's `loop` attribute re-seeks on the main thread and
// audibly stutters on a slow frame.

import { getAudioContext, getMasterInput } from './audioEngine'

/** Published under `public/`, so it ships with both the web build and the iOS bundle. */
const TRACK_URL = `${import.meta.env.BASE_URL}audio/theme.mp3`

/**
 * The music side of the mix. Paired with `BED_MIX` in audioEngine, which carries the
 * ambience side — roughly 60% music to 40% ambience. Change both together or the balance
 * drifts; they are two halves of one decision.
 */
const TRACK_GAIN = 0.7

/** Long enough to feel like the music arrives rather than switches on. */
const FADE_IN_S = 2.5
const FADE_OUT_S = 1.2

/**
 * Silence between takes, as a multiple of the track's own length.
 *
 * `0` — the piece runs continuously, which is what was asked for after hearing the gap.
 * It was briefly `1` (play once, rest for the same length). The idea was to stop a short
 * loop becoming tinnitus over an eight-hour idle session, but with the ambience mixed down
 * to `BED_MIX` the rest did not read as "the bed has the floor now", it read as the sound
 * cutting out — the bed alone is too quiet to hold a minute of silence open.
 *
 * Kept as a constant rather than deleted along with the scheduler: the mechanism is sound
 * and the number is the only thing that was wrong, so raising it is a one-token change if
 * a longer or more varied track ever makes a rest worth having again.
 */
const REST_RATIO = 0

let buffer: AudioBuffer | null = null
let source: AudioBufferSourceNode | null = null
let element: HTMLAudioElement | null = null
let gain: GainNode | null = null
/** Which mechanism is actually producing sound, for the on-device diagnostic. */
let mode: 'none' | 'buffer' | 'element' | 'failed' = 'none'
/** Why the preferred path failed, if it did. */
let lastError: string | null = null
/** Pending timer for the next take, so stopping can cancel a queued one. */
let restTimer: number | null = null

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
    const master = getMasterInput()
    if (!ctx || !master) return

    gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    // Exponential, not linear: loudness is perceptual, and a linear ramp from silence
    // sounds like it jumps most of the way in the first half-second.
    gain.gain.exponentialRampToValueAtTime(TRACK_GAIN, ctx.currentTime + FADE_IN_S)
    gain.connect(master)

    await initMusicTrack()
    if (buffer) {
      // With no rest, looping belongs to the audio thread: `loop = true` repeats inside the
      // renderer with no scheduling gap at all, where re-arming a node per take would leave
      // a seam every time the main thread was busy. `scheduleTake` still exists and is used
      // whenever REST_RATIO is non-zero.
      if (REST_RATIO <= 0) {
        source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(gain)
        source.start()
      } else {
        scheduleTake(ctx.currentTime)
      }
      mode = 'buffer'
      return
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    try {
      const el = new Audio(TRACK_URL)
      // Continuous unless a rest is configured; see REST_RATIO.
      el.loop = REST_RATIO <= 0
      el.preload = 'auto'
      el.addEventListener('ended', () => {
        if (REST_RATIO <= 0) return  // the element loops itself
        if (element !== el) return   // stopped, or replaced — do not resurrect it
        restTimer = window.setTimeout(() => {
          if (element !== el) return
          el.currentTime = 0
          void el.play().catch(() => { /* interrupted; the next start will retry */ })
        }, el.duration * REST_RATIO * 1000)
      })
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

/**
 * Play one take at `at` (audio-clock seconds) and arm the one after it.
 *
 * Re-arms from `onended` rather than from a single long chain scheduled up front: a chain
 * would keep firing after `stopMusicTrack`, and cancelling it would mean tracking every
 * node. One take in flight at a time is the whole state.
 */
function scheduleTake(at: number): void {
  const ctx = getAudioContext()
  if (!ctx || !buffer || !gain) return
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(gain)
  src.start(at)
  source = src
  src.onended = () => {
    if (source !== src) return   // superseded by a stop; stay quiet
    source = null
    restTimer = window.setTimeout(
      () => { if (mode === 'buffer') scheduleTake(getAudioContext()?.currentTime ?? 0) },
      buffer!.duration * REST_RATIO * 1000)
  }
}

/** What the music layer is doing, and why, for an on-device diagnostic. */
export function musicDiagnostic(): { mode: string; error: string | null; url: string } {
  return { mode, error: lastError, url: TRACK_URL }
}

/** Fade out and stop. Safe to call when nothing is playing. */
export function stopMusicTrack(): void {
  const ctx = getAudioContext()
  if (restTimer !== null) { window.clearTimeout(restTimer); restTimer = null }
  const s = source, g = gain, el = element
  source = null
  gain = null
  element = null
  mode = 'none'
  if (el) {
    // The element path has no scheduled stop; pause it and let the gain ramp cover the tail.
    window.setTimeout(() => { try { el.pause() } catch { /* gone */ } }, FADE_OUT_S * 1000)
  }
  if (!s) {
    if (g && ctx) {
      const t0 = ctx.currentTime
      g.gain.cancelScheduledValues(t0)
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t0)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + FADE_OUT_S)
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
  g.gain.exponentialRampToValueAtTime(0.0001, t + FADE_OUT_S)
  try { s.stop(t + FADE_OUT_S) } catch { /* already stopped */ }
  // Disconnect only after the ramp has actually run, or the node is torn out of the graph
  // mid-fade and the fade becomes a cut.
  window.setTimeout(() => { try { g.disconnect() } catch { /* gone */ } }, (FADE_OUT_S + 0.2) * 1000)
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
