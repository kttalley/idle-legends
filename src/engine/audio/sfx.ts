// ── Sound effects: CC0 retro samples, played on the frame the screen shows the event ─────
//
// The samples are recorded fantasy foley from several CC0 packs (listed in
// tools/sfx/cues.json), processed by tools/sfx/build.py into a 16-bit-era sampler sound
// (low-passed, 16 kHz, 12-bit) in public/audio/sfx/, with `manifest.json` mapping
// cue → files + gain. Swapping a sound is an edit to cues.json and a rebuild; nothing here
// names a file. The effects bus in audioEngine.ts adds a further low-pass and sits ~7 dB
// under the music.
//
// Who calls this: the renderer (combatAdapter.ts) for anything with an animation —
// swings, casts, spell impacts, hits taken — so the sound lands on the same frame as the
// flash rather than when the store decided it. App.tsx's combat-log tail for everything
// else (kills, loot, level-ups, bosses, deaths).
//
// An idle game auto-battles for hours, so restraint is built in rather than left to the
// callers: every cue has a minimum gap between plays, at most MAX_VOICES sounds overlap,
// variants rotate, and each play is detuned by a few percent so a hundred identical swings
// don't phase into one drone. Headless-safe like the rest of engine/audio: with no
// AudioContext every call is a no-op.

import { getAudioContext, getSfxInput, sfxEnabled } from './audioEngine'

export type SfxCue =
  | 'hit_slash' | 'hit_blunt' | 'hit_pierce' | 'hit_crit' | 'hurt' | 'ally_hit'
  | 'cast_fire' | 'cast_frost' | 'cast_shadow' | 'cast_arcane' | 'cast_nature'
  | 'impact_fire' | 'impact_frost' | 'impact_shadow' | 'impact_arcane' | 'impact_nature'
  | 'shadow_bolt' | 'spell_thud' | 'splash' | 'dot_tick'
  | 'mob_death' | 'boss_death' | 'gold' | 'loot' | 'loot_unique'
  | 'level_up' | 'unlock' | 'boss_spawn'
  | 'player_death' | 'player_respawn' | 'ally_down'

const BASE = `${import.meta.env.BASE_URL}audio/sfx/`
/** Overlapping sounds allowed at once. A pack fight plus loot can ask for a dozen. */
const MAX_VOICES = 6
/** Default minimum seconds between two plays of one cue. */
const DEFAULT_GAP = 0.07
/** Cues that fire in bursts get a wider gap so they read as one event, not a buzz. */
const GAP: Partial<Record<SfxCue, number>> = {
  ally_hit: 0.25, dot_tick: 0.4, gold: 0.15, hurt: 0.12, mob_death: 0.12, splash: 0.25,
  level_up: 1, unlock: 1, boss_spawn: 2, player_death: 1, player_respawn: 1,
}
/** ±this fraction of random pitch per play. Chiptune samples tolerate it well. */
const DETUNE = 0.03

/** `rate` is the cue's own playback pitch (cues.json), before the per-play detune. */
interface Cue { buffers: AudioBuffer[]; gain: number; rate: number; next: number; lastAt: number }

let cues: Partial<Record<SfxCue, Cue>> = {}
/** DEV only: what loaded and what played, for tools/uitest/suites/sfx.mjs. A test that
 *  counted AudioBufferSourceNodes could not say WHICH sound played, and the question that
 *  matters is whether a swing made a swing sound. */
interface DevProbe { loaded: string[]; played: string[] }
const devProbe: DevProbe | null = import.meta.env.DEV ? { loaded: [], played: [] } : null
if (devProbe) (window as unknown as { __sfx: DevProbe }).__sfx = devProbe
let loading: Promise<void> | null = null
let voices = 0

/**
 * Fetch and decode every sample. Called once the context exists (after the iOS gesture
 * latch). Never throws: a missing file loses that cue, not the game.
 */
export function initSfx(): Promise<void> {
  if (loading) return loading
  const ctx = getAudioContext()
  if (!ctx) return Promise.resolve()
  loading = (async () => {
    try {
      const res = await fetch(`${BASE}manifest.json`)
      const manifest = await res.json() as Record<string, { files: string[]; gain: number; rate?: number }>
      const decoded: Record<string, AudioBuffer> = {}
      const files = [...new Set(Object.values(manifest).flatMap(m => m.files))]
      await Promise.all(files.map(async f => {
        try {
          const data = await (await fetch(BASE + f)).arrayBuffer()
          decoded[f] = await ctx.decodeAudioData(data)
        } catch (err) {
          console.warn('[sfx] could not load', f, err)
        }
      }))
      const next: typeof cues = {}
      for (const [cue, m] of Object.entries(manifest)) {
        const buffers = m.files.map(f => decoded[f]).filter((b): b is AudioBuffer => !!b)
        if (buffers.length) next[cue as SfxCue] = { buffers, gain: m.gain, rate: m.rate ?? 1, next: 0, lastAt: -1 }
      }
      cues = next
      if (devProbe) devProbe.loaded = Object.keys(next)
    } catch (err) {
      console.warn('[sfx] manifest failed to load', err)
      loading = null   // let a later call retry
    }
  })()
  return loading
}

/**
 * Play a cue now. `gain` scales the cue's own mix level (e.g. a crit a little louder);
 * `delay` (seconds) staggers one event's sounds so they don't all hit one sample.
 */
export function playSfx(cue: SfxCue, gain = 1, delay = 0): void {
  if (!sfxEnabled()) return
  const ctx = getAudioContext()
  const out = getSfxInput()
  const c = cues[cue]
  if (!ctx || !out || !c || ctx.state !== 'running') return
  const at = ctx.currentTime + delay
  if (at - c.lastAt < (GAP[cue] ?? DEFAULT_GAP)) return
  if (voices >= MAX_VOICES) return
  c.lastAt = at

  const buf = c.buffers[c.next]
  c.next = (c.next + 1) % c.buffers.length
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = c.rate * (1 + (Math.random() * 2 - 1) * DETUNE)
  const g = ctx.createGain()
  g.gain.value = c.gain * gain
  src.connect(g).connect(out)
  voices++
  src.onended = () => {
    voices--
    try { g.disconnect() } catch { /* already gone */ }
  }
  src.start(at)
  devProbe?.played.push(cue)
}
