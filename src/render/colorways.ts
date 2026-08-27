// Colorways — the cosmetic SKU, and the one place premium content is defined.
//
// PLAN.md's Track M argues that this renderer IS the monetization engine: every unit is
// one rig recoloured through 15 semantic palette slots, so a "skin" costs zero marginal
// art. A colorway is exactly that — a set of slot overrides applied on top of whatever
// palette the hero would otherwise have had.
//
// The entitlement mapping is deliberately the whole story: `requiresEntitlement` on a
// colorway, checked in one place (`isColorwayUnlocked`). That is the HAMM pitch — one
// clean mapping from a RevenueCat entitlement to a palette id — not a SKU zoo.
//
// Slot contract (src/render/palettes.ts, docs/art-direction.md):
//   1–4 skin · 5–8 primary/tunic · 9–12 secondary/leather · 13–15 accent (rarity channel)
// A colorway deliberately never touches 1–4: recolouring skin would fight the race
// palettes, and a cosmetic must read as *gear*, not as a different person.

/** The single entitlement id configured in RevenueCat. */
export const FOUNDER_ENTITLEMENT = 'founder'

export interface Colorway {
  id: string
  name: string
  blurb: string
  /** Palette slot -> hex. Slots 5–15 only; see the note above about 1–4. */
  overrides: Partial<Record<number, string>>
  /** Undefined = free for everyone. Otherwise the RevenueCat entitlement that unlocks it. */
  requiresEntitlement?: string
}

export const DEFAULT_COLORWAY = 'standard'

export const COLORWAYS: Colorway[] = [
  {
    id: 'standard',
    name: 'Standard Issue',
    blurb: 'What they hand you at the muster.',
    overrides: {},
  },
  {
    id: 'ashen',
    name: 'Ashen Weave',
    blurb: 'Cloth cured in the smoke of the march.',
    overrides: {
      5: '#3b3540', 6: '#544c5c', 7: '#6f6578', 8: '#8d8296',
      9: '#2e2a24', 10: '#463f36', 11: '#5e5448', 12: '#786a5a',
    },
  },
  // ── Founder Pack ────────────────────────────────────────────────────────────
  {
    id: 'lastlight',
    name: 'Lastlight Gold',
    blurb: 'The colours of the Concord at its founding, before the line moved.',
    overrides: {
      5: '#6b4c14', 6: '#966d1c', 7: '#c39329', 8: '#efc25a',
      9: '#2b2f3e', 10: '#3e4457', 11: '#565d74', 12: '#727a93',
      13: '#8c6a1e', 14: '#c9a03c', 15: '#ffe9a8',
    },
    requiresEntitlement: FOUNDER_ENTITLEMENT,
  },
  {
    id: 'ashmarch',
    name: 'Ashmarch Ember',
    blurb: 'Ash behind, fire ahead. Worn by those who lit it.',
    overrides: {
      5: '#5a1e14', 6: '#832a1a', 7: '#b03f22', 8: '#e0682c',
      9: '#241d1c', 10: '#3a2c28', 11: '#523c34', 12: '#6e5044',
      13: '#7a2410', 14: '#c14a18', 15: '#ff9a4a',
    },
    requiresEntitlement: FOUNDER_ENTITLEMENT,
  },
  {
    id: 'drowned',
    name: 'Drowned Verdigris',
    blurb: 'Bronze left too long under the water table.',
    overrides: {
      5: '#12403a', 6: '#1c5b50', 7: '#2c7d6b', 8: '#49a48c',
      9: '#1b2a2e', 10: '#2b4045', 11: '#3d585e', 12: '#537279',
      13: '#1e6a58', 14: '#3fae8c', 15: '#a8f0d8',
    },
    requiresEntitlement: FOUNDER_ENTITLEMENT,
  },
]

const BY_ID = new Map(COLORWAYS.map(c => [c.id, c]))

export function getColorway(id: string): Colorway {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_COLORWAY)!
}

/**
 * The gate. `activeEntitlements` comes from RevenueCat's CustomerInfo.
 *
 * Fails CLOSED — an unknown colorway or a missing entitlement resolves to locked — but
 * callers are expected to fall back to the default colorway rather than to render
 * nothing, so a RevenueCat outage costs a player their skin, never their game.
 */
export function isColorwayUnlocked(id: string, activeEntitlements: ReadonlySet<string>): boolean {
  const cw = BY_ID.get(id)
  if (!cw) return false
  if (!cw.requiresEntitlement) return true
  return activeEntitlements.has(cw.requiresEntitlement)
}

/** Colorways the player may actually equip right now. */
export function unlockedColorways(activeEntitlements: ReadonlySet<string>): Colorway[] {
  return COLORWAYS.filter(c => isColorwayUnlocked(c.id, activeEntitlements))
}

// ── The founder aura ─────────────────────────────────────────────────────────
//
// What a paid colorway is worth, made visible from across the field.
//
// A recolour alone is a poor premium object in an isometric game: at this sprite scale the
// hero is ~24px tall and a palette swap of the tunic slots reads, honestly, as "a slightly
// different brown". The aura is the part that carries at a glance — and it is the part a
// player who bought it wants OTHER people to see, which is the whole social argument for
// a cosmetic in a game with a leaderboard and ghosts standing in your world.
//
// ── Why it is derived from the colorway rather than authored ─────────────────
// Each aura is built from the colorway's own ACCENT slots (13–15), which are the rarity
// channel and already the brightest, most saturated colours in the set. So Lastlight glows
// gold, Ashmarch burns orange, Drowned Verdigris runs cold green — each unmistakably the
// same object as the armour it surrounds, with no second palette to keep in sync. Add a
// colorway and its aura comes with it; retune a colorway and the aura follows.

export interface ColorwayAura {
  /** Bright inner colour — the core of the ground pool and the sprite bloom. */
  core: string
  /** Outer falloff. Reaches transparent by the edge of the glow. */
  glow: string
  /** Seconds per full pulse. Deliberately slow and slightly different per colorway, so
   *  three founders standing together do not throb in lockstep like one object. */
  period: number
}

/**
 * The aura for a colorway, or null when it has none.
 *
 * Only entitlement-gated colorways get one — that is the point of it. The free colorways
 * deliberately return null rather than a dim aura: a faint version of the premium effect
 * makes the premium one look like a brightness setting.
 */
export function colorwayAura(id: string): ColorwayAura | null {
  const cw = BY_ID.get(id)
  if (!cw || !cw.requiresEntitlement) return null
  const o = cw.overrides
  // 15 is the brightest accent, 14 the mid. Falls back through the tunic highlight so a
  // future colorway that leaves the accent channel alone still lights up rather than
  // silently losing its aura.
  const core = o[15] ?? o[8] ?? '#ffe9a8'
  const glow = o[14] ?? o[7] ?? '#c9a03c'
  // Periods are per-colorway constants rather than a hash: three values chosen to be
  // mutually prime-ish so the pulses drift apart instead of beating.
  const period = id === 'lastlight' ? 2.6 : id === 'ashmarch' ? 2.2 : 3.1
  return { core, glow, period }
}
