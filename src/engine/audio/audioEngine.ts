// Audio engine: one AudioContext, one master gain, volume and mute.
//
// Three buses sum into the master: music (musicTrack.ts), sound effects (sfx.ts) and
// ambience (ambience.ts). The volume slider and the master mute govern all of them; each
// bus also has its own on/off, which is what the Music, Sound effects and Ambience rows in
// the menu toggle.
//
// Until 2026-10-11 this file also generated a procedural per-zone "bed" (a detuned
// oscillator pad plus a filtered-noise wash, crossfaded on zone change) and a weather noise
// layer. Alongside them, generativeEngine.ts (Tone.js) played synthesized stingers on
// level-up, boss spawn and mob death. All of it was removed because none of it sounded good
// enough to keep. They are in git history at 9644c00. Sound effects are now CC0 retro
// samples (sfx.ts, tools/sfx/), not synthesis.
//
// Design rules this module obeys:
//  - Headless-safe. The sim harnesses run in Node with no AudioContext. Every entry point is a
//    no-op when the Web Audio API is absent, and this module is imported only from the React
//    side (App.tsx, GameMenu.tsx) — never from the store/engine path.
//  - External-store convention. Module-level state + subscribe/get exports, like party.ts —
//    session state that must not travel through the player store.

// ── Public state (subscribe/get) ────────────────────────────────────────────────────────
export interface AudioState {
  ready: boolean
  muted: boolean
  musicOn: boolean
  sfxOn: boolean
  ambienceOn: boolean
  volume: number
}
const listeners = new Set<() => void>()
// Cached snapshot. `getAudioState` must return a referentially-stable object between changes
// or useSyncExternalStore will loop — emit() is the only place it is rebuilt.
let cached: AudioState = { ready: false, muted: false, musicOn: true, sfxOn: true, ambienceOn: true, volume: 0.5 }
function emit(): void {
  cached = { ready: ctx != null, muted, musicOn, sfxOn, ambienceOn, volume }
  for (const l of listeners) l()
}
export function subscribeAudio(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function getAudioState(): AudioState {
  return cached
}

// ── Shared-graph access ──────────────────────────────────────────────────────────────────
// Sound sources must use THIS context and connect to their bus rather than to the
// destination — one context, one volume knob, one gesture-resume. All return null before
// init / in the headless sim.
export function getAudioContext(): AudioContext | null {
  return ctx
}
export function getMusicInput(): AudioNode | null {
  return musicBus
}
export function getSfxInput(): AudioNode | null {
  return sfxBus
}
export function getAmbienceInput(): AudioNode | null {
  return ambienceBus
}

// ── Engine state ─────────────────────────────────────────────────────────────────────────
let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null
let ambienceBus: GainNode | null = null

// Volume/mute are tracked even before the context exists so the first init lands at the right
// level, and so the UI reflects the knob without a round-trip.
let volume = 0.5
let muted = false

/**
 * Effects sit under the music, not on top of it. 0.45 is about 7 dB down; v1 ran the bus
 * at unity and the effects were "so much louder than the music" (2026-10-12).
 */
const SFX_LEVEL = 0.45
/**
 * Everything above this is rolled off the effects bus. The samples are already low-passed
 * at 5.5 kHz when built (tools/sfx/build.py); this is a second, gentler cut that also
 * catches anything added later without going through the build, so no effect can come back
 * as the thin, hissy top end v1 had.
 */
const SFX_LOWPASS_HZ = 4500
/** Ambience is texture, felt more than heard: about 18 dB under the master. */
const AMBIENCE_LEVEL = 0.12
let musicOn = true
let sfxOn = true
let ambienceOn = true

// ── Init ─────────────────────────────────────────────────────────────────────────────────
/**
 * Create the AudioContext and master gain. Idempotent. Must be called from a user gesture
 * on iOS (the WKWebView only resumes a context off a tap/keypress) — App.tsx latches it.
 * No-op when the Web Audio API is unavailable (Node harness).
 */
export function initAudio(): void {
  if (ctx) {
    // A gesture can arrive after init (e.g. context created suspended); resume if needed.
    void maybeResume()
    return
  }
  const Ctor: typeof AudioContext | undefined =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (typeof window !== 'undefined'
          ? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined)
  if (!Ctor) return
  ctx = new Ctor()
  masterGain = ctx.createGain()
  masterGain.gain.value = muted ? 0 : volume
  masterGain.connect(ctx.destination)
  musicBus = ctx.createGain()
  musicBus.gain.value = musicOn ? 1 : 0
  musicBus.connect(masterGain)
  sfxBus = ctx.createGain()
  sfxBus.gain.value = sfxOn ? 1 : 0
  const sfxTone = ctx.createBiquadFilter()
  sfxTone.type = 'lowpass'
  sfxTone.frequency.value = SFX_LOWPASS_HZ
  sfxTone.Q.value = 0.5
  const sfxLevel = ctx.createGain()
  sfxLevel.gain.value = SFX_LEVEL
  sfxBus.connect(sfxTone).connect(sfxLevel).connect(masterGain)
  ambienceBus = ctx.createGain()
  ambienceBus.gain.value = ambienceOn ? AMBIENCE_LEVEL : 0
  ambienceBus.connect(masterGain)

  void maybeResume()
  emit()
}

async function maybeResume(): Promise<void> {
  if (ctx && ctx.state === 'suspended') {
    try { await ctx.resume() } catch { /* ignore — will retry on next gesture */ }
  }
}

// ── Backgrounding / focus ────────────────────────────────────────────────────────────────
/**
 * Suspend the shared context when the app is backgrounded. Neither WebView reliably does it
 * for us: the Android WebView keeps rendering (its AAudio players stay `started` after
 * HOME), and on iOS a minimized app kept playing and kept the Dynamic Island speaker lit.
 * An idle game that keeps playing over the player's podcast is a removal-review bug.
 */
export async function suspendAudio(): Promise<void> {
  setMusicElementPlaying?.(false)
  if (!ctx || ctx.state !== 'running') return
  try { await ctx.suspend() } catch { /* ignore — a failed suspend is just today's behaviour */ }
}

/**
 * Undo suspendAudio, on returning to the foreground (App.tsx, native platforms only). The
 * context was unlocked by a user gesture at latch time, so a programmatic resume is
 * normally permitted; when iOS refuses one, App.tsx falls back to resuming on the next tap.
 * No-op unless suspended.
 */
export async function resumeAudio(): Promise<void> {
  await maybeResume()
  setMusicElementPlaying?.(true)
}

/** True when the context exists and is actually producing sound. */
export function audioRunning(): boolean {
  return ctx?.state === 'running'
}

/**
 * musicTrack.ts registers this so the `<audio>`-element fallback is paused along with the
 * context: suspending the context silences an element routed through it, but the element
 * itself keeps "playing", and an element that is playing is what iOS shows as Now Playing.
 * Set from there rather than imported, to keep this module free of a dependency on it.
 */
let setMusicElementPlaying: ((playing: boolean) => void) | null = null
export function onMusicElementPlayback(fn: (playing: boolean) => void): void {
  setMusicElementPlaying = fn
}

// ── Volume / mute ────────────────────────────────────────────────────────────────────────
export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v))
  applyMaster()
  emit()
}
export function setMuted(m: boolean): void {
  muted = m
  applyMaster()
  emit()
}
export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}
export function setMusicOn(on: boolean): void {
  musicOn = on
  ramp(musicBus, on ? 1 : 0)
  emit()
}
export function setSfxOn(on: boolean): void {
  sfxOn = on
  ramp(sfxBus, on ? 1 : 0)
  emit()
}
export function setAmbienceOn(on: boolean): void {
  ambienceOn = on
  ramp(ambienceBus, on ? AMBIENCE_LEVEL : 0)
  emit()
}
/** For sfx.ts: skip decoding and scheduling entirely while effects are off. */
export function sfxEnabled(): boolean {
  return sfxOn && !muted
}
function applyMaster(): void {
  ramp(masterGain, muted ? 0 : volume)
}
function ramp(node: GainNode | null, target: number): void {
  if (!ctx || !node) return
  const now = ctx.currentTime
  node.gain.cancelScheduledValues(now)
  node.gain.setValueAtTime(node.gain.value, now)
  node.gain.linearRampToValueAtTime(target, now + 0.12)
}
