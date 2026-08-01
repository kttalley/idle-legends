// Seeded pseudo-randomness.
//
// Two unrelated consumers need this, for two different reasons:
//
//  - **Ambient world life (Track L).** A zone's crowd should be arranged the same way
//    every time you walk back into it, and an ambient bug should be reproducible rather
//    than a thing that happened once.
//  - **Ghost PvP (Track P).** Two clients replay one duel from one seed and must reach
//    the same result, or there is no async PvP.
//
// The algorithm is **mulberry32** — small, fast, and good enough for gameplay rolls (it
// is not cryptographic and must never be used as though it were). It is deliberately
// the same generator `tools/sim/run.mjs` installs over the global `Math.random`, so a
// stream drawn here and a stream drawn there are comparable.
//
// A `Rng` is just `() => number` in [0, 1). That shape means an unseeded caller can
// pass `Math.random` itself and every seeded call site keeps working unchanged — which
// is what lets this be threaded through combat incrementally instead of in one
// all-or-nothing pass.

/** A source of uniform randomness in [0, 1). `Math.random` satisfies this. */
export type Rng = () => number

/**
 * A mulberry32 generator from a 32-bit seed. Distinct seeds give independent-looking
 * streams; the same seed always gives the same stream.
 */
export function mulberry32(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Hash a string into a 32-bit seed, so a name/zone id can key a stream directly.
 * FNV-1a — cheap and well-mixed enough that adjacent ids ("hero_1", "hero_2") do not
 * produce visibly correlated streams, which a naive `charCodeAt` sum very much does.
 */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Derive an independent sub-stream from a parent seed and a label.
 *
 * This is the important one for the ambient crowd. If every hero drew from ONE shared
 * generator, the number of draws each hero makes per frame would determine what every
 * *other* hero rolls next — so culling an off-screen hero (the whole point of the perf
 * budget) would change the behaviour of the heroes still on screen. Per-hero streams
 * keep each one's rolls independent of how many neighbours are being simulated.
 */
export function subStream(seed: number, label: string): Rng {
  return mulberry32((seed ^ hashSeed(label)) >>> 0)
}

/** Uniform float in [lo, hi). */
export function range(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo)
}

/** Uniform integer in [0, n). */
export function int(rng: Rng, n: number): number {
  return Math.floor(rng() * n) % Math.max(1, n)
}

/** Uniform element of a non-empty array. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[int(rng, arr.length)]
}

/** Pick by integer weight. Falls back to the first entry if the weights sum to 0. */
export function pickWeighted<T>(rng: Rng, arr: readonly T[], weight: (t: T) => number): T {
  let total = 0
  for (const t of arr) total += weight(t)
  if (total <= 0) return arr[0]
  let r = rng() * total
  for (const t of arr) {
    if ((r -= weight(t)) < 0) return t
  }
  return arr[arr.length - 1]
}
