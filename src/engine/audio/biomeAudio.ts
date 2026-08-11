// Biome → audio recipes.
//
// The procedural map generator already encodes a zone's mood in its colours, terrain mix and
// elevation profile (see mapGen.ts BIOME_MAP_CONFIGS / BIOME_TERRAIN). This table is the audio
// projection of the same idea: each ZoneId maps to a recipe that (a) the ambient-bed engine
// synthesizes from raw oscillators + filtered noise, and (b) the generative music layer reads
// for its musical grammar (scale, tempo, activity). Nothing is sampled — every sound is
// generated, so the App Store bundle ships zero audio assets and zero copyrighted material.
//
// ── Grounded in the reference tracks ──────────────────────────────────────────────────────
// The values for the four reference-grounded zones come from a spectral analysis of the WoW
// zone pieces the user provided (key via Krumhansl-Schmuckler chroma, brightness via spectral
// centroid, bass weight via low/high energy ratio, tempo via onset autocorrelation, activity
// via spectral flux). That analysis is offline-only; it informed these NUMBERS, not the audio.
//   Darnassus      → D minor, centroid 995 Hz, flux 357 (high activity), ~60 BPM  → forest
//   Dun Morogh     → F major, centroid 1413 Hz (bright), flux 140 (sparse), ~66 BPM → dustwind
//   Burning Steppes→ F / dark, centroid 572 Hz (lowest), bass-heavy, ~63 BPM       → volcanic
//   Tanaris        → A minor, centroid 1014 Hz, ~136 BPM (driving)                 → warsong
// Zones without a reference track keep hand-tuned guesses in the same vein.
//
// The 12 zones collapse onto 6 ARCHETYPES. The archetype owns the default character; per-zone
// overrides carry the variety (root, scale, tempo, tension) so same-archetype zones do not
// sound identical — and so the generative layer has per-zone grammar to work with.

import type { ZoneId } from '../../data/types'

export type AudioArchetype =
  | 'pastoral'   // bright, open, major — meadows / crossings
  | 'plains'     // dry, airy, neutral — flatlands (Dun Morogh: F major, bright, sparse)
  | 'desert'     // modal, driving, rhythmic — mesa (Tanaris: A minor, fast)
  | 'forest'     // modal minor, mysterious (Darnassus: D minor, ethereal, active)
  | 'jungle'     // dense, humid, low murk — overgrowth
  | 'volcanic'   // dark, tense, heat drone (Burning Steppes: F, low, bass-heavy)
  | 'abyssal'    // stark, desolate, sub-bass — endgame / badlands

export interface BiomeAudioRecipe {
  archetype: AudioArchetype
  /** Root pitch in Hz the pad voices and generative scale are built from. */
  rootFreq: number
  /** Pad oscillator waveform. */
  padOscType: OscillatorType
  /** Semitone offsets from the root for each pad voice. Root is always 0; stack open
   *  intervals (fifth=7, octave=12) for consonance, minor third=3 / flat-2=1 / tritone=6
   *  for colour and tension. */
  padVoices: number[]
  /** Cents of detune spread across the voices — wider reads as denser / rougher. */
  padDetuneSpread: number
  /** Pad lowpass cutoff multiple of rootFreq. Higher = brighter (Darnassus/Dun Morogh). */
  padCutoffMult: number
  /** Noise-bed filter shape: 'lowpass' → wind/wash, 'bandpass' → focused air/water. */
  noiseFilterType: BiquadFilterType
  /** Noise filter cutoff / centre in Hz. */
  noiseCutoff: number
  /** Noise-bed gain (0–1). Quiet; it is texture, not a feature. */
  noiseGain: number
  /** Swell LFO rate in Hz — the slow breathing of the pad gain. */
  swellLfoHz: number
  /** Depth of the swell modulation in linear gain. */
  swellDepth: number
  /** 0–1 dissonance/tension. The engine adds a detuned flat-2 voice and brightens the noise
   *  in proportion to this, so contested / high-level zones read as edgier. */
  tension: number
  /** Crossfade time between beds on zone change, in ms. */
  crossfadeMs: number

  // ── Generative-layer grammar (read by the rule-based music engine; ignored by the bed) ──
  /** Scale as semitone intervals from rootFreq the generative motifs draw from. */
  scale: number[]
  /** Base tempo (BPM) for the generative cells. Live world signals modulate around this. */
  tempoBpm: number
  /** 0–1 base note density / activity. Derived from reference spectral flux where available. */
  activity: number
}

// Archetype baselines. Zones inherit these and override per-zone.
const ARCHETYPE: Record<AudioArchetype, BiomeAudioRecipe> = {
  pastoral: {
    archetype: 'pastoral',
    rootFreq: 146.83, // D3
    padOscType: 'sine',
    padVoices: [0, 7, 12],          // root + fifth + octave — open major feel
    padDetuneSpread: 6,
    padCutoffMult: 4,
    noiseFilterType: 'lowpass',
    noiseCutoff: 600,
    noiseGain: 0.04,
    swellLfoHz: 0.06,
    swellDepth: 0.06,
    tension: 0.0,
    crossfadeMs: 3200,
    scale: [0, 2, 4, 7, 9],         // major pentatonic — gentle, can't go wrong
    tempoBpm: 70,
    activity: 0.4,
  },
  plains: { // Dun Morogh — F major, bright, sparse, slow
    archetype: 'plains',
    rootFreq: 87.31, // F2
    padOscType: 'triangle',
    padVoices: [0, 4, 7, 12],       // F major triad
    padDetuneSpread: 8,
    padCutoffMult: 6,               // bright (centroid 1413)
    noiseFilterType: 'bandpass',
    noiseCutoff: 900,
    noiseGain: 0.03,                // sparse
    swellLfoHz: 0.04,               // slow, contemplative
    swellDepth: 0.05,
    tension: 0.1,
    crossfadeMs: 3600,
    scale: [0, 2, 4, 7, 9],         // F major pentatonic
    tempoBpm: 66,
    activity: 0.4,                  // sparse (flux 140)
  },
  desert: { // Tanaris — A minor, modal, driving, rhythmic
    archetype: 'desert',
    rootFreq: 110.0, // A2
    padOscType: 'triangle',
    padVoices: [0, 7, 12],
    padDetuneSpread: 10,
    padCutoffMult: 5,
    noiseFilterType: 'bandpass',
    noiseCutoff: 1200,              // brighter texture for the rhythmic bed
    noiseGain: 0.06,
    swellLfoHz: 0.08,
    swellDepth: 0.05,
    tension: 0.25,
    crossfadeMs: 3200,
    scale: [0, 2, 3, 5, 7, 8, 10],  // A Aeolian (natural minor)
    tempoBpm: 136,                  // driving
    activity: 0.5,
  },
  forest: { // Darnassus — D minor, ethereal, high activity, mid-bright
    archetype: 'forest',
    rootFreq: 146.83, // D3
    padOscType: 'sine',
    padVoices: [0, 3, 7, 12],       // D minor triad
    padDetuneSpread: 10,
    padCutoffMult: 5,               // brighter than before (centroid 995)
    noiseFilterType: 'bandpass',
    noiseCutoff: 900,               // airy shimmer
    noiseGain: 0.05,
    swellLfoHz: 0.07,
    swellDepth: 0.07,
    tension: 0.3,
    crossfadeMs: 3600,
    scale: [0, 3, 5, 7, 10],        // D minor pentatonic — ethereal arpeggios
    tempoBpm: 60,
    activity: 0.9,                  // most active (flux 357)
  },
  jungle: {
    archetype: 'jungle',
    rootFreq: 82.41, // E2
    padOscType: 'sawtooth',
    padVoices: [0, 7, 12],          // low, wide — humid murk
    padDetuneSpread: 16,
    padCutoffMult: 3,
    noiseFilterType: 'bandpass',
    noiseCutoff: 350,
    noiseGain: 0.06,
    swellLfoHz: 0.08,
    swellDepth: 0.08,
    tension: 0.35,
    crossfadeMs: 3400,
    scale: [0, 2, 3, 5, 7, 9, 10],  // Dorian — humid, slightly exotic
    tempoBpm: 90,
    activity: 0.55,
  },
  volcanic: { // Burning Steppes — F, darkest, bass-heavy, low drone
    archetype: 'volcanic',
    rootFreq: 87.31, // F2 (sub weight comes from the low cutoff + flat-2 tension voice)
    padOscType: 'sawtooth',
    padVoices: [0, 1, 7, 12],       // flat-2 friction over a fifth — heat + dread
    padDetuneSpread: 18,
    padCutoffMult: 2.5,             // dark (centroid 572)
    noiseFilterType: 'lowpass',
    noiseCutoff: 160,               // rumble bed, bass-heavy (low/high 1.16)
    noiseGain: 0.09,
    swellLfoHz: 0.09,
    swellDepth: 0.09,
    tension: 0.8,
    crossfadeMs: 3000,
    scale: [0, 1, 3, 5, 7, 8, 10],  // F Phrygian — flat-2 dread
    tempoBpm: 63,
    activity: 0.55,
  },
  abyssal: {
    archetype: 'abyssal',
    rootFreq: 55.0, // A1 — sub-bass
    padOscType: 'sine',
    padVoices: [0, 12, 19],         // root + octave + fifth-above — stark, hollow
    padDetuneSpread: 5,
    padCutoffMult: 3,
    noiseFilterType: 'lowpass',
    noiseCutoff: 180,
    noiseGain: 0.05,
    swellLfoHz: 0.04,               // slow, desolate breathing
    swellDepth: 0.1,
    tension: 0.6,
    crossfadeMs: 4000,
    scale: [0, 1, 3, 7, 8],         // sparse Phrygian-ish — desolate
    tempoBpm: 54,
    activity: 0.3,
  },
}

/** Which archetype each zone projects. Derived from BIOME_MAP_CONFIGS colours + BIOME_TERRAIN
 *  materials, refined against the reference tracks where available. */
export const ZONE_ARCHETYPE: Record<ZoneId, AudioArchetype> = {
  sunhollow_meadows:  'pastoral',
  shattered_crossing: 'pastoral',
  dustwind_plains:    'plains',     // Dun Morogh reference
  warsong_mesa:       'desert',     // Tanaris reference
  grimshade_forest:   'forest',     // Darnassus reference
  venom_hollows:      'forest',     // Darnassus, toxic variant
  thornvale_jungle:   'jungle',
  ashfire_peaks:      'volcanic',   // Burning Steppes reference
  the_bloodfields:    'volcanic',   // Burning Steppes, contested
  cinderfall_wastes:  'volcanic',   // Burning Steppes, endgame
  ironcrag_badlands:  'abyssal',
  the_maw_eternal:    'abyssal',
}

// Per-zone recipes. Most inherit the archetype; the reference-grounded zones carry the
// analysed values, and same-archetype neighbours nudge root/tension/activity so they read as
// siblings, not clones. This is also the table future reference-wav analysis extends.
export const BIOME_AUDIO: Record<ZoneId, BiomeAudioRecipe> = {
  sunhollow_meadows:  { ...ARCHETYPE.pastoral },
  shattered_crossing: { ...ARCHETYPE.pastoral, rootFreq: 138.59, tension: 0.08, activity: 0.45 }, // C#3, contested bridge

  dustwind_plains:    { ...ARCHETYPE.plains },     // Dun Morogh (F major, bright, sparse)
  warsong_mesa:       { ...ARCHETYPE.desert },     // Tanaris (A minor, driving)

  grimshade_forest:   { ...ARCHETYPE.forest },     // Darnassus (D minor, ethereal)
  venom_hollows:      { ...ARCHETYPE.forest, rootFreq: 130.81, tension: 0.4, scale: [0, 1, 3, 5, 7, 10] }, // C3, toxic → Phrygian colour
  thornvale_jungle:   { ...ARCHETYPE.jungle },

  ashfire_peaks:      { ...ARCHETYPE.volcanic },   // Burning Steppes (F, dark, bass-heavy)
  the_bloodfields:    { ...ARCHETYPE.volcanic, rootFreq: 82.41, tension: 0.85, tempoBpm: 60 }, // E2, contested slaughter
  cinderfall_wastes:  { ...ARCHETYPE.volcanic, rootFreq: 73.42, tension: 0.9, tempoBpm: 58 },  // D2, endgame fire

  ironcrag_badlands:  { ...ARCHETYPE.abyssal, rootFreq: 61.74, tension: 0.45, activity: 0.35 }, // B1, stark mid-game rock
  the_maw_eternal:    { ...ARCHETYPE.abyssal, tension: 0.9, activity: 0.25 },                    // the final zone — most desolate
}

export function getBiomeAudio(zone: ZoneId): BiomeAudioRecipe {
  return BIOME_AUDIO[zone] ?? ARCHETYPE.pastoral
}