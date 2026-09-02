// Procedural ambient audio engine.
//
// Generates a continuous per-biome "bed" — a pad of detuned oscillators breathing under a slow
// LFO, plus a filtered noise wash — and crossfades between beds when the player changes zone.
// The recipe for each zone lives in biomeAudio.ts and is driven by the same signals the map
// generator already produces, so the world sounds like the place it looks like.
//
// Design rules this module obeys:
//  - No per-frame work. The bed is continuous (started sources + an LFO), and the only JS-side
//    audio work happens on store transitions (zone / volume / weather), as AudioParam ramps.
//    The two requestAnimationFrame loops (game logic + render) and the 5 Hz ambient AI already
//    contend for CPU on a mobile WKWebView; this module must not add to that.
//  - Headless-safe. The sim harnesses run in Node with no AudioContext. Every entry point is a
//    no-op when the Web Audio API is absent, and this module is imported only from App.tsx
//    (the React entry the harness never loads) — never from the store/engine path.
//  - Deterministic per-character. Pad detune offsets and LFO rates derive from
//    `worldSeed + hash(zoneId)`, mirroring mapGen's seeded ethos, so the same hero in the same
//    zone sounds the same across reloads.
//  - External-store convention. Module-level state + subscribe/get exports, like party.ts —
//    ambient state that must not travel through the player store.

import type { ZoneId } from '../../data/types'
import type { WeatherType } from '../../data/types'
import { getBiomeAudio, type BiomeAudioRecipe } from './biomeAudio'

// ── Seeded helpers (mirror mapGen.ts so a zone's sound is as stable as its map) ──────────
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function seededRand(seed: number, n: number): number {
  const x = Math.sin(seed * 9301 + n * 49297 + 233) * 16807
  return x - Math.floor(x)
}

// ── Public state (subscribe/get) ────────────────────────────────────────────────────────
export interface AudioState {
  ready: boolean
  muted: boolean
  volume: number
  activeZone: ZoneId | null
}
const listeners = new Set<() => void>()
// Cached snapshot. `getAudioState` must return a referentially-stable object between changes
// or useSyncExternalStore will loop — emit() is the only place it is rebuilt.
let cached: AudioState = { ready: false, muted: false, volume: 0.5, activeZone: null }
function emit(): void {
  cached = { ready: ctx != null, muted, volume, activeZone }
  for (const l of listeners) l()
}
export function subscribeAudio(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function getAudioState(): AudioState {
  return cached
}

// ── Shared-graph access for the generative layer ─────────────────────────────────────────
// The generative music engine (Tone.js) must use the SAME context as the bed — one context,
// one master gain, one volume knob, one gesture-resume — so it plugs into the master input
// rather than creating its own output. Both return null before init / in the headless sim.
export function getAudioContext(): AudioContext | null {
  return ctx
}
export function getMasterInput(): AudioNode | null {
  return masterGain
}

// ── Engine state ─────────────────────────────────────────────────────────────────────────
let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let weatherBus: GainNode | null = null
let weatherFilter: BiquadFilterNode | null = null
let currentBed: Bed | null = null
let activeZone: ZoneId | null = null

// Volume/mute are tracked even before the context exists so the first init lands at the right
// level, and so the UI reflects the knob without a round-trip.
let volume = 0.5
let muted = false

// The bed is TEXTURE now, subordinate to the orchestral generative layer (generativeEngine.ts:
// horns, war drums, strings sit above). Keep the pad low enough that it never buries them —
// "too droney" was the pad + noise washing out everything on top.
const PAD_BASE_GAIN = 0.09

/**
 * The one knob for how loud the ambience is against the music. ~40% ambience / 60% music.
 *
 * The bed's bus used to ramp to 1.0 — no master attenuation at all — while it summed four
 * layers (pad, tension, swell, noise) plus the weather bus. Each layer's own gain looked
 * modest in isolation, which is exactly how a bed that buries a 0.55 music track gets
 * written without anyone noticing: nothing in the file stated the intended balance, so
 * there was no number to get wrong. This is that number. Tune the mix HERE rather than by
 * nudging individual layers, which changes the bed's internal character as a side effect.
 */
export const BED_MIX = 0.4

interface Bed {
  zone: ZoneId
  bus: GainNode
  sources: AudioScheduledSourceNode[]
  teardown: () => void
}

// ── Init ─────────────────────────────────────────────────────────────────────────────────
/**
 * Create the AudioContext and persistent graph. Idempotent. Must be called from a user gesture
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

  // Persistent weather layer — survives zone crossfades, since rain does not stop because you
  // crossed a zone boundary. A looped noise source through a bandpass, gain-modulated per type.
  buildWeatherLayer()

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
 * over the player's podcast is a removal-review bug. Suspending freezes the audio clock,
 * which also keeps Tone's absolute-time voice cursors coherent across the gap (the same
 * property `stopGenerative` relies on across a suspend). No-op when not running.
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

// Held so the weather noise source is never GC'd mid-session (a connected AudioBufferSourceNode
// can still be collected without a JS reference).
const weatherSources: AudioScheduledSourceNode[] = []

function buildWeatherLayer(): void {
  if (!ctx || !masterGain) return
  const noise = makeNoiseSource(ctx)
  noise.loop = true
  weatherFilter = ctx.createBiquadFilter()
  weatherFilter.type = 'bandpass'
  weatherFilter.frequency.value = 1200
  weatherFilter.Q.value = 0.7
  weatherBus = ctx.createGain()
  weatherBus.gain.value = 0.02 * BED_MIX
  noise.connect(weatherFilter).connect(weatherBus).connect(masterGain)
  noise.start()
  // Hold the source so it is never GC'd mid-session.
  weatherSources.push(noise)
}

// ── Zone / bed ───────────────────────────────────────────────────────────────────────────
/**
 * Crossfade to a zone's bed. Builds the new bed at zero gain, ramps it in while ramping the
 * old bed out, then tears the old one down after the fade. Safe to call rapidly (dev zone
 * jump): a mid-fade change just retires the in-flight bed on the same schedule.
 */
export function setZone(zone: ZoneId, worldSeed = 0): void {
  if (!ctx || !masterGain) { activeZone = zone; emit(); return }
  if (currentBed && currentBed.zone === zone) return
  activeZone = zone
  const recipe = getBiomeAudio(zone)
  const seed = (worldSeed ^ hashStr(zone)) >>> 0

  const next = buildBed(zone, ctx, recipe, seed)
  next.bus.connect(masterGain)
  const now = ctx.currentTime
  const fade = recipe.crossfadeMs / 1000
  next.bus.gain.setValueAtTime(0, now)
  next.bus.gain.linearRampToValueAtTime(BED_MIX, now + fade)

  if (currentBed) {
    const old = currentBed
    // Snap the fade-out from whatever gain the old bed is currently at, so a rapid chain of
    // zone changes does not leave a bed fading out from a stale ramp target.
    const curGain = old.bus.gain.value
    old.bus.gain.cancelScheduledValues(now)
    old.bus.gain.setValueAtTime(curGain, now)
    old.bus.gain.linearRampToValueAtTime(0, now + fade)
    const t = window.setTimeout(() => old.teardown(), (fade + 0.2) * 1000)
    pendingTimers.add(t)
  }
  currentBed = next
  emit()
}

function buildBed(zone: ZoneId, c: AudioContext, r: BiomeAudioRecipe, seed: number): Bed {
  const bus = c.createGain()
  const sources: AudioScheduledSourceNode[] = []

  // ── Pad: detuned voices through a shared lowpass, swelled by an LFO ──
  const padFilter = c.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = Math.max(200, r.rootFreq * r.padCutoffMult)
  padFilter.Q.value = 0.5
  const padGain = c.createGain()
  padGain.gain.value = PAD_BASE_GAIN
  padFilter.connect(padGain).connect(bus)

  for (let i = 0; i < r.padVoices.length; i++) {
    const semis = r.padVoices[i]
    const osc = c.createOscillator()
    osc.type = r.padOscType
    osc.frequency.value = r.rootFreq * Math.pow(2, semis / 12)
    // Per-voice detune from the seed: same hero/zone → same spread across reloads.
    const det = (seededRand(seed, i + 1) - 0.5) * r.padDetuneSpread
    osc.detune.value = det
    osc.connect(padFilter)
    osc.start()
    sources.push(osc)
  }
  // Tension adds a low-gain flat-2 voice (+1 semitone) detuned against the root — friction
  // that scales with the recipe's tension value, so contested / high-level zones read edgier.
  if (r.tension > 0) {
    const t = c.createOscillator()
    t.type = r.padOscType
    t.frequency.value = r.rootFreq * Math.pow(2, 1 / 12)
    t.detune.value = (seededRand(seed, 99) - 0.5) * r.padDetuneSpread
    const tg = c.createGain()
    tg.gain.value = 0.04 * r.tension
    t.connect(tg).connect(padFilter)
    t.start()
    sources.push(t)
  }

  // Swell LFO → padGain.gain. Two slightly detuned LFOs (rates from the seed) give a
  // non-mechanical breathing rather than a metronomic pulse.
  for (let k = 0; k < 2; k++) {
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = r.swellLfoHz * (1 + (seededRand(seed, 50 + k) - 0.5) * 0.2)
    const lg = c.createGain()
    lg.gain.value = r.swellDepth / 2
    lfo.connect(lg).connect(padGain.gain)
    lfo.start()
    sources.push(lfo)
  }

  // ── Noise bed: looped white noise through the recipe's filter ──
  const noise = makeNoiseSource(c)
  noise.loop = true
  const nf = c.createBiquadFilter()
  nf.type = r.noiseFilterType
  nf.frequency.value = r.noiseCutoff
  nf.Q.value = r.noiseFilterType === 'bandpass' ? 0.8 : 0.5
  const ng = c.createGain()
  ng.gain.value = r.noiseGain * (1 + r.tension * 0.4)
  noise.connect(nf).connect(ng).connect(bus)
  noise.start()
  sources.push(noise)

  const teardown = () => {
    const n = c.currentTime
    for (const s of sources) {
      try { s.stop(n + 0.05) } catch { /* already stopped */ }
      try { s.disconnect() } catch { /* noop */ }
    }
    try { bus.disconnect() } catch { /* noop */ }
  }
  return { zone, bus, sources, teardown }
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
function applyMaster(): void {
  if (!ctx || !masterGain) return
  const now = ctx.currentTime
  const target = muted ? 0 : volume
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setValueAtTime(masterGain.gain.value, now)
  masterGain.gain.linearRampToValueAtTime(target, now + 0.12)
}

// ── Weather ──────────────────────────────────────────────────────────────────────────────
const WEATHER: Record<WeatherType, { gain: number; freq: number }> = {
  clear:  { gain: 0.018, freq: 900 },
  cloudy: { gain: 0.035, freq: 500 },
  rain:   { gain: 0.08,  freq: 1600 },
}
export function setWeather(type: WeatherType): void {
  if (!ctx || !weatherBus || !weatherFilter) return
  const w = WEATHER[type] ?? WEATHER.clear
  const now = ctx.currentTime
  weatherBus.gain.cancelScheduledValues(now)
  weatherBus.gain.setValueAtTime(weatherBus.gain.value, now)
  weatherBus.gain.linearRampToValueAtTime(w.gain * BED_MIX, now + 2.0)
  weatherFilter.frequency.cancelScheduledValues(now)
  weatherFilter.frequency.setValueAtTime(weatherFilter.frequency.value, now)
  weatherFilter.frequency.linearRampToValueAtTime(w.freq, now + 2.0)
}

// ── Noise source factory ─────────────────────────────────────────────────────────────────
function makeNoiseSource(c: AudioContext): AudioBufferSourceNode {
  // 2 s of white noise, reused as a loop. Cheap to build once per bed/weather layer.
  const len = Math.floor(c.sampleRate * 2)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  return src
}

// Track teardown timers so they can be cleared if the engine is ever torn down (it is not, in
// practice — the context lives for the session — but this keeps the lint honest about the
// setTimeout return being observed).
const pendingTimers = new Set<number>()