// Rule-based generative ORCHESTRAL music layer, driven by live world state.
//
// The ambient bed (audioEngine.ts) is the static drone foundation of a zone. This module is the
// living music on top of it — and per the user's brief it must sound WoW-zone-esque: HORNS,
// WAR DRUMS, sustained STRINGS, CHOIR, not a sine-pad drone. It is grounded in a spectral
// analysis of four reference zone pieces (Darnassus / Dun Morogh / Burning Steppes / Tanaris):
//
//   Darnassus      D minor  centroid 995  motion 361  drum 27%  sustain 0.77 → forest: CHOIR +
//                  sustained strings, ethereal, NO drums, gentle motion.
//   Dun Morogh     F major  centroid 1413 motion 679  drum 21%  sustain 0.71 → plains: bright
//                  STRINGS + melodic horn/wind motion, NO drums.
//   Burning Steppes F dark  centroid 572  motion 517  drum 31%  sustain 0.78 → volcanic: low
//                  BRASS + TIMPANI + heavy half-note WAR DRUMS, doom.
//   Tanaris        A minor  centroid 1014 motion 670  drum 38%  sustain 0.71 → desert: DRIVING
//                  16th-note WAR DRUMS (136 BPM) + strings + horn motifs.
//
// The throughline the analysis exposed: sustain 0.71–0.78 EVERYWHERE (orchestral held notes,
// not plucks), melodic motion EVERYWHERE (moving lines, not static pedals), and war drums ONLY
// where the reference has them (Steppes/Tanaris; effectively none for forest/plains). The first
// attempt built sine plucks + a sparse membrane knock + a static drone — ambient-Eno. This
// rebuild delivers the orchestral palette the reference actually shows.
//
// Arrangement (per archetype, the recipe carries root/scale/tempo/tension):
//   • STRINGS  — PolySynth sawtooth → warm lowpass → reverb, sustained CHORD PROGRESSIONS that
//     move (i - vi - v - VII etc.), so the harmony breathes instead of pedalling one chord.
//   • HORNS    — MonoSynth sawtooth with a filter envelope that opens on attack (brass "bwaah"),
//     playing a seeded REPEATING MOTIF (the zone's theme), not random isolated notes. Low-brass
//     variant for volcanic.
//   • CHOIR    — PolySynth sine, very slow attack, heavy reverb, sustained chords — the
//     ethereal colour for forest / abyssal.
//   • WAR DRUMS — MembraneSynth kick + NoiseSynth snare/hat in a Tone.Sequence beat grid at the
//     zone's tempoBpm. Driving 16ths for desert, heavy half-notes for volcanic, none for
//     forest/plains/pastoral. THE biggest missing piece.
//   • TIMPANI  — a second low MembraneSynth for volcanic doom strikes.
//   • BASS     — low MonoSynth anchoring the current chord root.
//
// Brian Eno's generative principle still holds: the horn MOTIF length is chosen relatively-prime
// to the bar (9/11/13 steps over 8th notes) so motif-against-drums rarely repeats exactly, and
// the motif is seeded per character+zone so the same hero has the same theme. Repetition = theme
// = "horns"; relative-prime length = the combination never gets stale.
//
// Headless-safe: Tone is dynamically imported inside initGenerative() (so the Node sim never
// loads it), and every entry is a no-op before the shared context exists. Like the bed, this
// module is imported only from App.tsx, never from the store/engine path.

import type { ZoneId } from '../../data/types'
import { getBiomeAudio, type AudioArchetype } from './biomeAudio'
import { getAudioContext, getMasterInput } from './audioEngine'
import type { PolySynth, MonoSynth, MembraneSynth, NoiseSynth, Filter, Reverb, Gain, Loop, Sequence } from 'tone'

// ── Seeded RNG (deterministic per character/zone, but still "generative") ────────────────
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0 || 0x6d2b79f5
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** semis from zone root → Hz, with an octave shift to place a voice in its register. */
const hz = (root: number, semis: number, octShift = 0) => root * Math.pow(2, (semis + 12 * octShift) / 12)

// ── Per-archetype arrangement ────────────────────────────────────────────────────────────
// Chord progressions are semitone-offset triads from the zone root. Each entry is a chord the
// strings (and choir, where active) hold for one phrase; the bass plays the chord root below.
// These are the harmonic "movement" the analysis said was missing.
type DrumProfile = 'none' | 'driving' | 'doom' | 'sparse'
interface Arrangement {
  drums: DrumProfile
  strings: boolean
  choir: boolean
  horns: 'motif' | 'lowbrass' | 'none'
  timpani: boolean
  progression: number[][]
  /** Tone.Loop interval between chord changes. */
  phraseInterval: string
  /** 16-step drum pattern: 0 rest, 1 kick, 2 snare, 3 hat. */
  drumPattern: number[]
  /** motif subdivision + length pool (relatively-prime to a 4-beat bar). */
  motifSubdiv: string
  motifLens: number[]
}

const ARR: Record<AudioArchetype, Arrangement> = {
  pastoral: {
    drums: 'none', strings: true, choir: false, horns: 'motif', timpani: false,
    // I - V - vi - IV (bright major, open meadow)
    progression: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
    phraseInterval: '2m', drumPattern: [],
    motifSubdiv: '8n', motifLens: [9, 11, 13],
  },
  plains: { // Dun Morogh — bright F major, lots of melodic motion, no drums
    drums: 'none', strings: true, choir: false, horns: 'motif', timpani: false,
    progression: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
    phraseInterval: '2m', drumPattern: [],
    motifSubdiv: '8n', motifLens: [11, 13],
  },
  desert: { // Tanaris — A Aeolian, DRIVING 16th war drums at 136 BPM
    drums: 'driving', strings: true, choir: false, horns: 'motif', timpani: false,
    // i - VI - v - VII
    progression: [[0, 3, 7], [8, 12, 15], [7, 10, 14], [10, 14, 17]],
    phraseInterval: '1m',
    drumPattern: [1, 3, 3, 3, 2, 3, 3, 3, 1, 3, 1, 3, 2, 3, 3, 3],
    motifSubdiv: '8n', motifLens: [9, 11, 13],
  },
  forest: { // Darnassus — D minor, ethereal CHOIR + sustained strings, no drums
    drums: 'none', strings: true, choir: true, horns: 'none', timpani: false,
    // i - VI - iv - III
    progression: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [3, 7, 10]],
    phraseInterval: '2m', drumPattern: [],
    motifSubdiv: '4n', motifLens: [5, 7], // slow, spacious — choir leads
  },
  jungle: { // dense, humid, low — light sparse perc
    drums: 'sparse', strings: true, choir: false, horns: 'motif', timpani: false,
    // i - VII - IV - i (Dorian-flavoured)
    progression: [[0, 3, 7], [10, 14, 17], [5, 9, 12], [0, 3, 7]],
    phraseInterval: '2m',
    drumPattern: [1, 0, 3, 0, 0, 0, 3, 0, 1, 0, 3, 0, 0, 0, 0, 0],
    motifSubdiv: '8n', motifLens: [9, 11],
  },
  volcanic: { // Burning Steppes — F Phrygian, dark, low brass + timpani + heavy doom drums
    drums: 'doom', strings: true, choir: false, horns: 'lowbrass', timpani: true,
    // i - bII - VI - VII (the bII is the Phrygian dread)
    progression: [[0, 3, 7], [1, 5, 8], [8, 12, 15], [10, 14, 17]],
    phraseInterval: '2m',
    drumPattern: [1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
    motifSubdiv: '4n', motifLens: [5, 7], // slow, low, doom
  },
  abyssal: { // stark, desolate, sub-bass — sparse timpani, choir, no motif
    drums: 'doom', strings: true, choir: true, horns: 'none', timpani: true,
    // i - bII - VI - bII (no resolution — desolate)
    progression: [[0, 3, 7], [1, 5, 8], [8, 12, 15], [1, 5, 8]],
    phraseInterval: '2m',
    drumPattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    motifSubdiv: '4n', motifLens: [5],
  },
}

// ── State ────────────────────────────────────────────────────────────────────────────────
let Tone: typeof import('tone') | null = null
let ready = false
let genBus: Gain | null = null

// Tone instruments (typed via the type-only import at the top — erases at runtime so the Node
// sim never loads Tone; runtime values come from the dynamic import in initGenerative()).
let strings: PolySynth | null = null
let choir: PolySynth | null = null
let horns: MonoSynth | null = null
let bass: MonoSynth | null = null
let kick: MembraneSynth | null = null
let snare: NoiseSynth | null = null
let hat: NoiseSynth | null = null
let timpani: MembraneSynth | null = null
// Stinger-only voices. Deliberately NOT reused by any Transport part — see the note where
// they are constructed; sharing an instrument between a sequenced part and a
// gameplay-triggered stinger is what produced the intermittent Tone timeline assert.
let stingerBrass: PolySynth | null = null
let stingerDrum: MembraneSynth | null = null
let stringsFilter: Filter | null = null
let busReverb: Reverb | null = null
let droneGain: Gain | null = null

// Scheduled loops/sequences — rebuilt per zone so the motif + drums match the archetype.
let chordLoop: Loop | null = null
let hornSeq: Sequence | null = null
let drumSeq: Sequence | null = null
let timpaniLoop: Loop | null = null

let recipe: ReturnType<typeof getBiomeAudio> | null = null
let arrangement: Arrangement | null = null
let motif: number[] = []          // scale-degree indices, -1 = rest
let chordIndex = 0
let pendingZone: { zone: ZoneId; worldSeed: number } | null = null

// Live world snapshot, updated by App's subscription + the tile sampler.
interface WorldSignals {
  entityCount: number
  gameMode: string
  boss: boolean
  weather: string
  danger: number        // 0 (trivial) .. 1 (under-levelled)
  registerShift: number // semitones, from tile histogram
  tensionAdd: number    // 0..1, from tiles + danger
  densityMul: number    // from tiles + life
}
let signals: WorldSignals = {
  entityCount: 0, gameMode: 'combat', boss: false, weather: 'clear',
  danger: 0, registerShift: 0, tensionAdd: 0, densityMul: 1,
}

// ── Init ─────────────────────────────────────────────────────────────────────────────────
export async function initGenerative(): Promise<void> {
  const ctx = getAudioContext()
  const master = getMasterInput()
  if (!ctx || !master || ready) return
  try {
    Tone = await import('tone')
  } catch {
    return // Tone unavailable (e.g. blocked) — music layer just stays silent
  }
  // Share the bed's context: one context, one master gain, one volume knob, one resume.
  Tone.setContext(ctx)

  // Generative sits ABOVE the bed now — the orchestral layer is the foreground, the bed is
  // texture. (The bed's pad gain was lowered to match; see audioEngine.ts PAD_BASE_GAIN.)
  genBus = new Tone.Gain(0.62)
  genBus.connect(master)

  // A shared reverb wash on the sustained + melodic voices — the "cathedral" the WoW zone
  // pieces sit in. Drums bypass it (dry, in-your-face) so the war drums stay punchy.
  busReverb = new Tone.Reverb({ decay: 7, wet: 0.42 })
  busReverb.connect(genBus)

  // Strings: sawtooth choir through a warm lowpass, slow envelopes, sustained. Plays chords.
  stringsFilter = new Tone.Filter({ type: 'lowpass', frequency: 1400, Q: 0.6 })
  stringsFilter.connect(busReverb)
  strings = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth' },
    envelope: { attack: 0.5, decay: 0.4, sustain: 0.8, release: 2.2 },
    volume: -12,
  })
  strings.connect(stringsFilter)

  // Choir: sine, very slow swell, heavy wash — ethereal forest/abyssal colour.
  const choirFilter = new Tone.Filter({ type: 'lowpass', frequency: 2200, Q: 0.4 })
  const choirVerb = new Tone.Reverb({ decay: 9, wet: 0.6 })
  choirFilter.connect(choirVerb)
  choirVerb.connect(genBus)
  choir = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsine' },
    envelope: { attack: 1.4, decay: 0.6, sustain: 0.9, release: 3.5 },
    volume: -15,
  })
  choir.connect(choirFilter)

  // Horns: sawtooth brass with a filter envelope that opens on attack → "bwaah". Monophonic
  // melody (the motif). Low-brass character comes from a lower baseFrequency + slower env in
  // applySignals() per archetype.
  horns = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.06, decay: 0.25, sustain: 0.55, release: 0.5 },
    filter: { type: 'lowpass', frequency: 1600, Q: 1.1 },
    filterEnvelope: { attack: 0.05, decay: 0.25, sustain: 0.5, release: 0.6, baseFrequency: 380, octaves: 3.2 },
    volume: -8,
  })
  horns.connect(busReverb)

  // Bass: low, anchors the current chord root.
  bass = new Tone.MonoSynth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.25, decay: 0.5, sustain: 0.5, release: 1.4 },
    filter: { type: 'lowpass', frequency: 260, Q: 0.7 },
    volume: -15,
  })
  bass.connect(genBus)

  // War drums — kick + snare + hat. Dry (no reverb) so they punch.
  kick = new Tone.MembraneSynth({
    pitchDecay: 0.045, octaves: 5,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0 },
    volume: -9,
  })
  kick.connect(genBus)

  snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
    volume: -13,
  })
  const snareFilter = new Tone.Filter({ type: 'highpass', frequency: 1200, Q: 0.5 })
  snare.connect(snareFilter)
  snareFilter.connect(genBus)

  hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    volume: -24,
  })
  const hatFilter = new Tone.Filter({ type: 'highpass', frequency: 6000, Q: 0.5 })
  hat.connect(hatFilter)
  hatFilter.connect(genBus)

  // Timpani: a second, lower membrane synth with a longer decay — volcanic doom strikes.
  timpani = new Tone.MembraneSynth({
    pitchDecay: 0.12, octaves: 3,
    envelope: { attack: 0.004, decay: 0.9, sustain: 0.1, release: 1.2 },
    volume: -10,
  })
  timpani.connect(busReverb)

  // ── Stinger voices: DEDICATED, never shared with a sequenced part ──────────────────────
  //
  // Game stingers used to play through `horns` / `kick` / `timpani` / `bass`, and that was
  // the source of the intermittent
  //   "The time must be greater than or equal to the last scheduled time"
  // Tone throws from `Timeline.add()`.
  //
  // Every one of those instruments is driven by a Transport part (hornSeq, drumSeq,
  // timpaniLoop, chordLoop). The Transport schedules its callbacks with LOOKAHEAD, so those
  // parts have already written events onto the instrument's timeline at times in the near
  // future. A stinger fires from a gameplay event at `Tone.now()`, which is frequently
  // EARLIER than what the sequencer already queued on that same instrument — and the write
  // goes backwards. Whether it collides depends on where in the bar the kill landed, which
  // is exactly why it appeared intermittently and would not reproduce on demand.
  //
  // `horns` made it worse by also being a MonoSynth: the level-up arpeggio fired four
  // overlapping notes into a single-voice timeline.
  //
  // Separate voices fix it structurally rather than by timing luck — a stinger can no
  // longer contend with the score at all. PolySynth for the fanfare so the arpeggio has
  // somewhere to put its overlapping notes.
  stingerBrass = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.05, decay: 0.25, sustain: 0.45, release: 0.5 },
    volume: -10,
  })
  stingerBrass.connect(busReverb)

  stingerDrum = new Tone.MembraneSynth({
    pitchDecay: 0.06, octaves: 4,
    envelope: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.8 },
    volume: -10,
  })
  stingerDrum.connect(busReverb)

  // Boss / tension drone: a held root + flat-2, gain-ramped in and out. Kept from the prior
  // version — it is the one bed-like voice that earns its place, because it only appears on a
  // boss and reads as dread, not as ambient fill.
  const droneRoot = new Tone.Oscillator(55, 'sawtooth')
  const droneFlat2 = new Tone.Oscillator(55 * Math.pow(2, 1 / 12), 'sawtooth')
  droneGain = new Tone.Gain(0)
  const droneFilter = new Tone.Filter({ type: 'lowpass', frequency: 260, Q: 1 })
  droneRoot.connect(droneFilter); droneFlat2.connect(droneFilter)
  droneFilter.connect(droneGain)
  droneGain.connect(genBus)
  droneRoot.start(); droneFlat2.start()

  ready = true
  Tone.getTransport().start()

  // If a zone was set before init completed, build its arrangement now.
  if (pendingZone) {
    const p = pendingZone; pendingZone = null
    setGenerativeZone(p.zone, p.worldSeed)
  }
}

// ── Motif generation (seeded, repeating theme per zone) ──────────────────────────────────
/** Build a repeating melodic motif: a walk through the zone's scale with rests, biased toward
 *  stepwise motion so it sings rather than leaps. Length is chosen relatively-prime to the
 *  4-beat bar so motif-over-drums rarely lands the same way twice. -1 = rest. */
function genMotif(rng: () => number, scaleLen: number, len: number): number[] {
  const m: number[] = []
  let prev = Math.floor(rng() * scaleLen)
  for (let i = 0; i < len; i++) {
    if (rng() < 0.30) { m.push(-1); continue }
    let deg: number
    if (rng() < 0.72) {
      deg = prev + (rng() < 0.5 ? -1 : 1)
      deg = clamp(deg, 0, scaleLen - 1)
    } else {
      deg = Math.floor(rng() * scaleLen)
    }
    m.push(deg); prev = deg
  }
  return m
}

// ── Zone change: re-seed + re-grammar + rebuild arrangement ───────────────────────────────
export function setGenerativeZone(zone: ZoneId, worldSeed: number): void {
  const r = getBiomeAudio(zone)
  recipe = r
  arrangement = ARR[r.archetype]
  const seed = (worldSeed ^ hashStr(zone)) >>> 0
  const rng = mulberry32(seed)

  // Per-zone motif theme.
  const lenPool = arrangement.motifLens
  const motifLen = lenPool[Math.floor(rng() * lenPool.length)]
  motif = genMotif(rng, r.scale.length, motifLen)

  chordIndex = 0

  if (!Tone || !ready) { pendingZone = { zone, worldSeed }; return }

  // Tempo from recipe; signals modulate around it in applySignals().
  Tone.getTransport().bpm.value = r.tempoBpm

  rebuildArrangement()
  applySignals()
}

/** Tear down the current scheduled loops and build new ones for the active archetype. */
function rebuildArrangement(): void {
  if (!Tone || !ready || !arrangement || !recipe) return
  // Dispose existing — their patterns belong to the previous zone.
  chordLoop?.dispose(); chordLoop = null
  hornSeq?.dispose(); hornSeq = null
  drumSeq?.dispose(); drumSeq = null
  timpaniLoop?.dispose(); timpaniLoop = null

  // ── Chord progression: strings (+ choir) hold a chord each phrase, bass walks the root ──
  chordLoop = new Tone.Loop((time: number) => {
    const a = arrangement, r = recipe
    if (!a || !r) return
    const chord = a.progression[chordIndex % a.progression.length]
    chordIndex++
    const reg = Math.round(signals.registerShift)
    // Strings: chord lifted +2 octaves into their register.
    const stringNotes = chord.map(s => hz(r.rootFreq, s + reg, 2))
    if (a.strings && strings) strings.triggerAttackRelease(stringNotes, a.phraseInterval, time)
    // Choir: same chord +3 octaves, only where active. Longer, slower.
    if (a.choir && choir) choir.triggerAttackRelease(chord.map(s => hz(r.rootFreq, s + reg, 3)), a.phraseInterval, time)
    // Bass: chord root, down an octave.
    if (bass) bass.triggerAttackRelease(hz(r.rootFreq, chord[0] + reg, -1), a.phraseInterval, time)
  }, arrangement.phraseInterval)
  chordLoop.start(0)

  // ── Horn motif: a repeating themed line through the scale ───────────────────────────────
  if (arrangement.horns !== 'none' && motif.length) {
    let step = 0
    hornSeq = new Tone.Sequence((time: number, degree: number) => {
      if (!horns || !recipe) return
      step = (step + 1) % motif.length
      if (degree < 0) return
      // Density gating from live world state — thins the motif when sparse, fills when busy.
      if (Math.random() > signals.densityMul) return
      const reg = Math.round(signals.registerShift)
      const oct = arrangement!.horns === 'lowbrass' ? 1 : 2 // low brass sits lower
      const note = hz(recipe.rootFreq, recipe.scale[degree] + reg, oct)
      const dur = arrangement!.horns === 'lowbrass' ? '2n' : '8n'
      horns.triggerAttackRelease(note, dur, time)
    }, motif, arrangement.motifSubdiv)
    hornSeq.start(0)
  }

  // ── War drums: 16-step beat grid at zone tempo ───────────────────────────────────────────
  if (arrangement.drums !== 'none' && arrangement.drumPattern.length) {
    drumSeq = new Tone.Sequence((time: number, step: number) => {
      if (!arrangement) return
      // Combat / danger can push a martial beat onto otherwise-drumless zones; traveling mutes.
      if (!drumsActive()) return
      const v = step // 0 rest, 1 kick, 2 snare, 3 hat
      if (v === 1 && kick) kick.triggerAttackRelease('C1', '16n', time)
      else if (v === 2 && snare) snare.triggerAttackRelease('16n', time)
      else if (v === 3 && hat) hat.triggerAttackRelease('32n', time)
    }, arrangement.drumPattern, '16n')
    drumSeq.start(0)
  }

  // ── Timpani: slow doom strikes on the down-beat for volcanic / abyssal ──────────────────
  if (arrangement.timpani && timpani) {
    timpaniLoop = new Tone.Loop((time: number) => {
      if (!recipe || !timpani) return
      const reg = Math.round(signals.registerShift)
      timpani.triggerAttackRelease(hz(recipe.rootFreq, reg, -1), '2n', time)
    }, '2m')
    timpaniLoop.start('2m')
  }
}

// ── Live world signals ───────────────────────────────────────────────────────────────────
export function updateWorldSignals(s: Partial<WorldSignals>): void {
  signals = { ...signals, ...s }
  applySignals()
}

function drumsActive(): boolean {
  if (!arrangement) return false
  if (signals.gameMode === 'traveling') return false
  // Archetypes with a real drum profile always drum (except traveling).
  if (arrangement.drums === 'driving' || arrangement.drums === 'doom') return true
  // Sparse drums only when there is life/combat around.
  if (arrangement.drums === 'sparse') return signals.entityCount > 0 || signals.gameMode === 'combat'
  return false
}

function applySignals(): void {
  if (!ready || !recipe) return
  const r = recipe
  const arr = arrangement

  // Entity density: more creatures around → busier motif, slightly faster.
  const ent = clamp(signals.entityCount / 8, 0, 1)
  const entityDensity = 0.6 + 0.5 * ent
  const tempoMul = 1 + 0.12 * ent

  // Game mode shapes the whole texture.
  let modeDensity = 1, modeTension = 0
  switch (signals.gameMode) {
    case 'combat':    modeDensity = 1.15; modeTension = 0.25; break
    case 'gathering': modeDensity = 0.7; break
    case 'in_town':   modeDensity = 0.8; break
    case 'traveling': modeDensity = 0.4; break
    default: break
  }
  const weatherDensity = signals.weather === 'cloudy' ? 0.9 : 1

  const totalDensity = entityDensity * modeDensity * weatherDensity * signals.densityMul
  const totalTension = clamp01((r.tension ?? 0) + signals.tensionAdd + modeTension + signals.danger * 0.3)

  // Horn motif density lives on signals.densityMul so the Sequence's per-step gate picks it up.
  signals.densityMul = clamp(totalDensity, 0.12, 1)

  // Tempo: zone base * entity push, eased in town, dragged down for doom zones under tension.
  if (Tone && ready) {
    const townMul = signals.gameMode === 'in_town' ? 0.85 : 1
    const doomDrag = arr?.drums === 'doom' ? (1 - 0.12 * totalTension) : 1
    Tone.getTransport().bpm.value = r.tempoBpm * tempoMul * townMul * doomDrag
  }

  // Brighten the strings' lowpass with activity, darken with tension — the spectral-centroid
  // motion the analysis measured (Dun Morogh bright, Burning Steppes dark).
  if (stringsFilter && Tone) {
    const t = Tone.now()
    const target = clamp(900 + 700 * ent + 400 * (r.archetype === 'plains' || r.archetype === 'pastoral' ? 1 : 0) - 600 * totalTension, 350, 2600)
    stringsFilter.frequency.cancelScheduledValues(t)
    stringsFilter.frequency.setValueAtTime(stringsFilter.frequency.value, t)
    stringsFilter.frequency.linearRampToValueAtTime(target, t + 2)
  }

  // Boss → swell the flat-2 drone; otherwise ease it out.
  if (droneGain && Tone) {
    const t = Tone.now()
    const g = signals.boss ? 0.08 + 0.05 * totalTension : 0
    droneGain.gain.cancelScheduledValues(t)
    droneGain.gain.setValueAtTime(droneGain.gain.value, t)
    droneGain.gain.linearRampToValueAtTime(g, t + (signals.boss ? 2.5 : 4))
  }
}

// ── Stingers (combat-log events) ─────────────────────────────────────────────────────────
//
// Tone's `Timeline.add()` asserts events arrive in non-decreasing time order, per voice.
// Stingers now play on `stingerBrass` / `stingerDrum`, which no Transport part touches, so
// a gameplay event can no longer schedule behind the sequencer's lookahead. See the note at
// their construction for why sharing instruments was the bug.
//
// Two things still have to hold WITHIN the stinger path itself, because it is driven by
// gameplay and gameplay bursts:
//   • `stingerDrum` is monophonic (MembraneSynth), so overlapping thuds still go backwards
//     on its own timeline — kills arrive in clusters, so this is the common case.
//   • `stingerBrass` is polyphonic and tolerates overlap, but a stinger scheduled behind an
//     earlier one is still an out-of-order write.
// A per-voice cursor covers both: it is now bookkeeping over voices this module fully
// owns, rather than an attempt to predict what the Transport had already queued.
const voiceFreeAt = new Map<string, number>()

/**
 * Reserve `duration` seconds on a voice at `desired`, or return null to drop the sound.
 *
 * Dropping rather than queueing is deliberate for frequent, incidental sounds: a backlog of
 * kill-thuds arriving a second late reads as broken audio, whereas one missed inside a burst
 * is inaudible. Rare, meaningful stingers (level-up, boss) are nudged past the busy voice
 * instead, because those must actually be heard.
 */
function reserve(voice: string, desired: number, duration: number, drop: boolean): number | null {
  const freeAt = voiceFreeAt.get(voice) ?? 0
  let at = desired
  if (at < freeAt) {
    if (drop) return null
    at = freeAt + 0.02
  }
  voiceFreeAt.set(voice, at + duration)
  return at
}

/** Clear the cursors whenever the clock they are expressed in restarts. */
function resetVoiceCursors(): void {
  voiceFreeAt.clear()
}

export function playStinger(kind: 'level_up' | 'boss_spawn' | 'mob_death'): void {
  if (!Tone || !ready || !recipe) return
  const now = Tone.now()
  const root = recipe.rootFreq
  if (kind === 'level_up' && stingerBrass) {
    // Bright ascending brass arpeggio: root, third, fifth, octave. Polyphonic voice, so the
    // four notes may overlap — on the old MonoSynth they were fighting for one voice.
    const t = reserve('brass', now, 0.9, false)
    if (t === null) return
    const up = (semi: number) => hz(root, semi, 2)
    stingerBrass.triggerAttackRelease(up(0), '8n', t)
    stingerBrass.triggerAttackRelease(up(4), '8n', t + 0.12)
    stingerBrass.triggerAttackRelease(up(7), '8n', t + 0.24)
    stingerBrass.triggerAttackRelease(up(12), '4n', t + 0.36)
  } else if (kind === 'boss_spawn') {
    // Low dark swell — the drone ramp above carries the swell; this adds the strike.
    if (stingerDrum) {
      const t = reserve('drum', now, 1.0, false)
      if (t !== null) stingerDrum.triggerAttackRelease(hz(root, 0, -1), '2n', t)
    }
    if (stingerBrass) {
      const t = reserve('brass', now, 1.0, false)
      if (t !== null) stingerBrass.triggerAttackRelease(hz(root, 1, -1), '2n', t) // flat-2
    }
  } else if (kind === 'mob_death' && stingerDrum) {
    // A dry thud + resolve. Dropped rather than delayed when the voices are busy — kills
    // burst, and this is the sound that would otherwise pile up.
    const tk = reserve('drum', now, 0.12, true)
    if (tk !== null) stingerDrum.triggerAttackRelease('C1', '16n', tk)
    if (stingerBrass) {
      const th = reserve('brass', now + 0.08, 0.3, true)
      if (th !== null) stingerBrass.triggerAttackRelease(hz(root, 0, 2), '8n', th)
    }
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────────────────
export function stopGenerative(): void {
  if (Tone && ready) Tone.getTransport().pause()
  // The cursors are absolute times on the audio clock. A paused/restarted transport (or a
  // suspended context on iOS backgrounding) can leave them ahead of a `Tone.now()` that has
  // effectively rewound, which would silently drop every stinger from then on.
  resetVoiceCursors()
}
export function startGenerative(): void {
  if (Tone && ready) Tone.getTransport().start()
  resetVoiceCursors()
}
export function isGenerativeReady(): boolean {
  return ready
}