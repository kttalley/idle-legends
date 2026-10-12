// ── Ambience: quiet recorded nature beds, layered by biome ─────────────────────────────
//
// Not the procedural pad and noise wash removed on 2026-10-11 — that was synthesis and read
// as a drone. These are CC0 field recordings (birds, a river, wind, crickets, a swamp, rain;
// sources in tools/sfx/ambience.json) built by tools/sfx/build_ambience.py into short
// .m4a beds. Each zone mixes one or two of them, rain joins when the weather turns, and the
// whole bus sits about 18 dB under the master (AMBIENCE_LEVEL in audioEngine.ts).
//
// Looping: a bed is played as overlapping passes, each faded in and out over its own
// edges, so the seam is a crossfade between two copies rather than a cut. That also hides
// the few ms of AAC priming at either end of the file. Start times are absolute on the
// audio clock; timers only have to fire before the next pass is due.
//
// Headless-safe like the rest of engine/audio: with no AudioContext every call is a no-op.

import type { WeatherType, ZoneId } from '../../data/types'
import { getAmbienceInput, getAudioContext } from './audioEngine'

type Bed = 'birds' | 'river' | 'wind' | 'crickets' | 'swamp' | 'rain'

const BASE = `${import.meta.env.BASE_URL}audio/ambience/`

/** What each zone sounds like. Gains are relative within the (already quiet) bus. */
const ZONE_BEDS: Record<ZoneId, Partial<Record<Bed, number>>> = {
  sunhollow_meadows:  { birds: 0.8, crickets: 0.25 },
  shattered_crossing: { river: 0.9, birds: 0.4 },
  thornvale_jungle:   { swamp: 0.7, birds: 0.5 },
  grimshade_forest:   { crickets: 0.6, wind: 0.3 },
  venom_hollows:      { swamp: 0.9 },
  the_maw_eternal:    { swamp: 0.5, wind: 0.4 },
  dustwind_plains:    { wind: 0.7, crickets: 0.2 },
  ironcrag_badlands:  { wind: 0.7, crickets: 0.25 },
  warsong_mesa:       { wind: 0.6, crickets: 0.3 },
  ashfire_peaks:      { wind: 0.9 },
  the_bloodfields:    { wind: 0.6 },
  cinderfall_wastes:  { wind: 0.8 },
}
/** Rain sits over whatever the zone already has. */
const RAIN_GAIN = 0.7
/** How long a zone or weather change takes to settle, in seconds. */
const CHANGE_S = 3
/** Longest crossfade between two passes of a bed; short beds use a quarter of their length. */
const MAX_XFADE_S = 3

interface Layer {
  buffer: AudioBuffer | null
  /** Level this layer is heading to (0 = silent; it stops scheduling once faded out). */
  target: number
  out: GainNode
  timer: number | null
  running: boolean
}

const layers = new Map<Bed, Layer>()
let loading: Promise<void> | null = null
let zone: ZoneId | null = null
let weather: WeatherType = 'clear'

/** Fetch and decode every bed. Never throws: a missing bed is just silence. */
export function initAmbience(): Promise<void> {
  if (loading) return loading
  const ctx = getAudioContext()
  const bus = getAmbienceInput()
  if (!ctx || !bus) return Promise.resolve()
  loading = (async () => {
    try {
      const manifest = await (await fetch(`${BASE}manifest.json`)).json() as Record<Bed, string>
      await Promise.all(Object.entries(manifest).map(async ([bed, file]) => {
        try {
          const data = await (await fetch(BASE + file)).arrayBuffer()
          const buffer = await ctx.decodeAudioData(data)
          const out = ctx.createGain()
          out.gain.value = 0
          out.connect(bus)
          layers.set(bed as Bed, { buffer, target: 0, out, timer: null, running: false })
        } catch (err) {
          console.warn('[ambience] could not load', file, err)
        }
      }))
      apply()
    } catch (err) {
      console.warn('[ambience] manifest failed to load', err)
      loading = null
    }
  })()
  return loading
}

/** The zone the hero is in, or null at character select (which is silent). */
export function setAmbienceZone(z: ZoneId | null): void {
  if (z === zone) return
  zone = z
  apply()
}

export function setAmbienceWeather(w: WeatherType): void {
  if (w === weather) return
  weather = w
  apply()
}

function apply(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const want: Partial<Record<Bed, number>> = zone ? { ...ZONE_BEDS[zone] } : {}
  if (zone && weather === 'rain') want.rain = RAIN_GAIN
  const now = ctx.currentTime
  for (const [bed, layer] of layers) {
    const target = want[bed] ?? 0
    if (target === layer.target) continue
    layer.target = target
    layer.out.gain.cancelScheduledValues(now)
    layer.out.gain.setValueAtTime(layer.out.gain.value, now)
    layer.out.gain.linearRampToValueAtTime(target, now + CHANGE_S)
    if (target > 0 && !layer.running) {
      layer.running = true
      schedulePass(layer, now + 0.05)
    }
  }
}

/** Play one pass of a bed at `at`, faded over its own edges, and arrange the next. */
function schedulePass(layer: Layer, at: number): void {
  const ctx = getAudioContext()
  if (!ctx || !layer.buffer) { layer.running = false; return }
  // Once a layer has faded to nothing it stops scheduling; `apply` restarts it.
  if (layer.target === 0 && at > ctx.currentTime + CHANGE_S) { layer.running = false; return }
  const dur = layer.buffer.duration
  const xf = Math.min(MAX_XFADE_S, dur / 4)

  const src = ctx.createBufferSource()
  src.buffer = layer.buffer
  const env = ctx.createGain()
  // Equal-power edges: two overlapping passes sum to a constant loudness, not a dip.
  const steps = 32
  const rise = new Float32Array(steps), fall = new Float32Array(steps)
  for (let i = 0; i < steps; i++) {
    rise[i] = Math.sin((i / (steps - 1)) * Math.PI / 2)
    fall[i] = Math.cos((i / (steps - 1)) * Math.PI / 2)
  }
  env.gain.setValueAtTime(0, at)
  env.gain.setValueCurveAtTime(rise, at, xf)
  env.gain.setValueCurveAtTime(fall, at + dur - xf, xf)
  src.connect(env).connect(layer.out)
  src.start(at)
  src.onended = () => { try { env.disconnect() } catch { /* gone */ } }

  const next = at + dur - xf
  const lead = Math.max(0, (next - ctx.currentTime - 1.5) * 1000)
  layer.timer = window.setTimeout(() => { layer.timer = null; schedulePass(layer, next) }, lead)
}

/** DEV only: which beds are loaded, where each is heading and whether it is looping, for
 *  tools/uitest/suites/sfx.mjs. Stripped from release builds by the DEV guard. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __ambience?: () => unknown }).__ambience = () => ({
    zone, weather,
    beds: Object.fromEntries([...layers].map(([bed, l]) => [bed, { target: l.target, running: l.running }])),
  })
}
