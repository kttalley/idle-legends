// Audio engine: one AudioContext, one master gain, volume and mute.
//
// Two buses sum into the master: music (musicTrack.ts) and sound effects (sfx.ts). The
// volume slider and the master mute govern both; each bus also has its own on/off, which
// is what the Music and Sound effects rows in the menu toggle.
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
  volume: number
}
const listeners = new Set<() => void>()
// Cached snapshot. `getAudioState` must return a referentially-stable object between changes
// or useSyncExternalStore will loop — emit() is the only place it is rebuilt.
let cached: AudioState = { ready: false, muted: false, musicOn: true, sfxOn: true, volume: 0.5 }
function emit(): void {
  cached = { ready: ctx != null, muted, musicOn, sfxOn, volume }
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

// ── Engine state ─────────────────────────────────────────────────────────────────────────
let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null

// Volume/mute are tracked even before the context exists so the first init lands at the right
// level, and so the UI reflects the knob without a round-trip.
let volume = 0.5
let muted = false
let musicOn = true
let sfxOn = true

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
  sfxBus.connect(masterGain)

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
 * Suspend the shared context: the Android WebView keeps rendering Web Audio while the
 * activity is backgrounded (iOS WKWebView suspends on its own — verified by watching the
 * app's AAudio players stay `started` after HOME), and an idle game that keeps playing
 * over the player's podcast is a removal-review bug. No-op when not running.
 */
export async function suspendAudio(): Promise<void> {
  if (!ctx || ctx.state !== 'running') return
  try { await ctx.suspend() } catch { /* ignore — a failed suspend is just today's behaviour */ }
}

/**
 * Undo suspendAudio — Android only (App.tsx gates the listeners to the android platform);
 * on iOS WebKit owns suspend/resume and must not gain a second resume path. The context
 * was unlocked by a user gesture at latch time, so a programmatic resume is permitted
 * after that. No-op unless suspended.
 */
export async function resumeAudio(): Promise<void> {
  await maybeResume()
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
