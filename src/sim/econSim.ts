// ── Headless economy harness ──────────────────────────────────────────────────
//
// Drives the REAL Zustand store (no UI, no React) so the numbers below are the
// game's numbers, not a model of them. Run it with `node tools/sim/run.mjs`,
// which esbuild-bundles this file with a localStorage shim.
//
// This file is never imported by the app. It lives under src/ so `tsc --noEmit`
// typechecks it against the live store — a harness that drifts from the code it
// measures is worse than no harness. Same reason `src/render/dev/harness.ts` is
// where it is.
//
// Why it exists: the economy had no measurements. `.planning/economy-and-towns-plan.md`
// §4.3 makes measuring the gold curve a precondition for pricing anything.

import { useGameStore } from '../store/gameStore'
import { INVENTORY_SLOTS, RARITY_WEIGHTS, BAG_SLOTS_MAX_PURCHASED } from '../data/constants'
import type { ClassType, GameState, RaceType, TownId, ZoneId } from '../data/types'
import { ZONE_ORDER } from '../data/zones'
import { canEnterZone, townForZone } from '../engine/zoneProgression'
import { slotStorage } from '../store/saveSlots'
import { projectOfflineProgress } from '../engine/offline'
import { itemPower } from '../data/items'

// ── Expected value of a destroyed drop ────────────────────────────────────────
// The bag-full branch logs a name, not a price, so a lost item's worth has to be
// modelled. `generateItem` prices at `level × rarityMult × U(0.8,1.2)`, so the
// expectation over the drop table is level × E[rarityMult].
const RARITY_VALUE_MULT: Record<string, number> = {
  common: 1, uncommon: 3, rare: 8, epic: 25, legendary: 100,
}
export const EXPECTED_VALUE_MULT = (() => {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  let acc = 0
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    acc += (weight / total) * RARITY_VALUE_MULT[rarity]
  }
  return acc   // ≈ 4.15 gold per item level
})()

export interface Sample {
  /** Simulated minutes since the run started. */
  minute: number
  level: number
  zone: ZoneId
  circuit: number
  /** Cumulative gold held (the sim never spends, so this is also gold earned). */
  gold: number
  bagUsed: number
  bagSize: number
  /** Cumulative counts since the run started. */
  itemsLooted: number
  /** Drops that overflowed the bag. Destroyed outright before the salvage change;
   *  sold at SALVAGE_RATE after it. */
  itemsLost: number
  /** Cumulative modelled vendor value of everything that overflowed — what the old
   *  bag-full branch destroyed, and the yardstick salvage income is judged against. */
  lostValueEst: number
  /** Gold actually recovered from overflow (`totalSalvaged`), 0 before the change. */
  salvagedGold: number
  /** Bag slots bought with gold. */
  bagSlotsBought: number
  /** Gold the merchant contract earned, and what it cost to keep. */
  autoSold: number
  upkeepPaid: number
  contract: 'none' | 'active' | 'lapsed'
  deaths: number
  // ── Liveness probe ──────────────────────────────────────────────────────────
  // A stalled run reads identically to a slow one in the gold column alone, so
  // the sampler also records what the hero was actually doing.
  mode: string
  alive: boolean
  hpPct: number
  /** Mobs standing in the zone, and the distance to the engaged one. */
  mobCount: number
  targetDist: number | null
  /** Kills recorded in the current zone, cumulative. */
  zoneKills: number
  /** Logical map position — a frozen one means the world drift is pinned. */
  pos: { x: number; y: number }
}

export interface ScenarioOpts {
  minutes: number
  playerClass?: ClassType
  playerRace?: RaceType
  /** Seconds of game time per tick. The real loop runs at rAF cadence; a coarser
   *  step is the whole point of a harness, but combat resolves at most one swing
   *  per tick, so this must stay below the fastest attack interval. */
  stepSeconds?: number
  /** Sample cadence, in simulated minutes. */
  sampleEveryMinutes?: number
  /**
   * Emulate a player who moves on when a zone opens up. An untouched idle player
   * NEVER leaves the starting zone — `selectZone` is a click — so the zone-tier
   * gold curve is only observable with this on. Both regimes are real; the idle
   * one is the house-rule baseline.
   */
  advanceZones?: boolean
  /** Sell every common on every sample, i.e. the closest thing to a sink today. */
  sellCommons?: boolean
  /**
   * Emulate a player who spends: at each sample, duck into the linked town and buy
   * every bag slot currently affordable, then leave. The point of the scenario is to
   * check that gold's first sink is reachable on the measured income curve — if the
   * ladder outruns the faucet, the sink is decorative.
   */
  buyBagSlots?: boolean
  /**
   * Emulate a player who engages a factor as soon as they can afford one, and then
   * leaves it running. The scenario the merchant contract exists to serve — and the
   * only way to check that its upkeep is smaller than what it earns.
   */
  buyContract?: boolean
  /**
   * Equip strict upgrades out of the BAG at each sample — a player who clicks.
   *
   * Distinct from the game's own auto-equip (`settings.autoEquip`, on by default), which
   * only ever sees a drop as it lands. This mops up anything that reached the bag before
   * it became an upgrade, so it models an engaged player on top of the automatic floor.
   */
  autoEquip?: boolean
  /**
   * Turn the game's `settings.autoEquip` OFF, reproducing the pre-auto-equip behaviour.
   * Kept so the counterfactual stays measurable: with it, an untouched hero stalls at
   * level ~20 and then takes zero kills for hours, which is the whole reason the feature
   * exists. Regression guard, not a play style.
   */
  disableAutoEquip?: boolean
  /** Seed for the harness's `Math.random` swap — makes a run reproducible. */
  seed?: number | null
}

/** Installed by tools/sim/run.mjs. Null restores the real `Math.random`. */
declare const __setSeed: undefined | ((seed: number | null) => void)

export interface ScenarioResult {
  opts: Required<ScenarioOpts>
  samples: Sample[]
  final: Sample
  /** Simulated minute at which the bag first hit capacity, or null. */
  firstFullAtMinute: number | null
  /** Wall-clock milliseconds the simulation took. */
  wallMs: number
}

/**
 * Equip every strict upgrade sitting in the bag, lowest slot first.
 *
 * Repeats until nothing changes, because `equipItem` swaps the old piece back into the
 * bag and that displaced item can itself be an upgrade for another slot later in the
 * pass. Bounded so a comparison that ever reports "both better" cannot spin.
 */
function equipUpgrades(store: typeof useGameStore): void {
  for (let pass = 0; pass < 8; pass++) {
    const s = store.getState()
    let acted = false
    for (let i = 0; i < s.inventory.length; i++) {
      const item = s.inventory[i]
      if (!item) continue
      const worn = s.equipment[item.slot]
      if (worn && itemPower(item) <= itemPower(worn)) continue
      store.getState().equipItem(i)
      acted = true
      break
    }
    if (!acted) return
  }
}

/** Log ids already accounted for, so each combat-log line is counted once. */
function makeLogReader() {
  const seen = new Set<string>()
  return (entries: { id: string; message: string }[]) => {
    const fresh: string[] = []
    for (const e of entries) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      fresh.push(e.message)
    }
    return fresh
  }
}

export function runScenario(opts: ScenarioOpts): ScenarioResult {
  const o: Required<ScenarioOpts> = {
    playerClass: 'warrior',
    playerRace: 'human',
    stepSeconds: 0.25,
    sampleEveryMinutes: 5,
    advanceZones: false,
    sellCommons: false,
    buyBagSlots: false,
    buyContract: false,
    autoEquip: false,
    disableAutoEquip: false,
    seed: null,
    ...opts,
  }

  if (typeof __setSeed === 'function') __setSeed(o.seed)

  const store = useGameStore
  store.getState().initGame(o.playerClass, o.playerRace)
  if (o.disableAutoEquip) {
    const st = store.getState()
    useGameStore.setState({ settings: { ...st.settings, autoEquip: false } })
  }

  const readNewLogs = makeLogReader()
  const samples: Sample[] = []
  let itemsLooted = 0
  let itemsLost = 0
  let lostValueEst = 0
  let deaths = 0
  let firstFullAtMinute: number | null = null

  const totalTicks = Math.round((o.minutes * 60) / o.stepSeconds)
  const ticksPerSample = Math.round((o.sampleEveryMinutes * 60) / o.stepSeconds)
  const started = Date.now()

  for (let t = 1; t <= totalTicks; t++) {
    store.getState().tick(o.stepSeconds)
    const s = store.getState()

    for (const msg of readNewLogs(s.combatLog)) {
      if (msg.startsWith('Looted:')) itemsLooted++
      // Overflow, under either regime: the old destroy branch and the salvage that
      // replaced it, so a before/after comparison counts the same events.
      else if (msg.startsWith('Bag full') || msg.includes('bags full') || msg.includes('no room, salvaged')) {
        itemsLost++
        lostValueEst += s.level * EXPECTED_VALUE_MULT
      // The real log line is "You have been slain! Respawning in Ns..." — an earlier
      // guess at this string silently reported 0 deaths for every run.
      } else if (msg.includes('You have been slain')) deaths++
    }

    if (firstFullAtMinute === null && s.inventory.every(Boolean)) {
      firstFullAtMinute = (t * o.stepSeconds) / 60
    }

    if (t % ticksPerSample === 0) {
      const minute = (t * o.stepSeconds) / 60

      if (o.advanceZones) {
        // Move on the moment the next zone is legal. This is the "engaged player
        // who keeps up with progression" regime.
        const idx = ZONE_ORDER.indexOf(s.currentZone)
        // ZONE_ORDER is declared `string[]` in data/zones.ts; every entry is a ZoneId.
        const next = ZONE_ORDER[idx + 1] as ZoneId | undefined
        if (next && canEnterZone(next, s.level, s.bossesDefeated)) {
          store.getState().selectZone(next)
        }
      }
      if (o.autoEquip) equipUpgrades(store)
      if (o.sellCommons) store.getState().sellAllCommon()

      if (o.buyBagSlots || o.buyContract) {
        const townId = townForZone(store.getState().currentZone)
        if (townId) {
          const resume = store.getState().gameMode
          store.getState().enterTown(townId as TownId)
          if (o.buyContract) store.getState().buyMerchantContract()
          // Buy while affordable. buyBagSlot is a no-op at the ceiling or short on
          // gold, so the loop needs its own bound to stay honest about termination.
          if (o.buyBagSlots) {
            for (let n = 0; n < BAG_SLOTS_MAX_PURCHASED; n++) {
              const before = store.getState().bagSlotsPurchased
              store.getState().buyBagSlot()
              if (store.getState().bagSlotsPurchased === before) break
            }
          }
          store.getState().leaveTown()
          if (resume === 'gathering' || resume === 'crafting') store.getState().setMode(resume)
        }
      }

      const after = store.getState()
      const tgt = after.currentMob
      samples.push({
        minute,
        level: after.level,
        zone: after.currentZone,
        circuit: after.zoneCircuit ?? 0,
        gold: after.gold,
        bagUsed: after.inventory.filter(Boolean).length,
        bagSize: after.inventory.length,
        itemsLooted, itemsLost, lostValueEst, deaths,
        salvagedGold: after.totalSalvaged,
        bagSlotsBought: after.bagSlotsPurchased,
        autoSold: after.totalAutoSold,
        upkeepPaid: after.totalUpkeepPaid,
        contract: !after.merchantContract ? 'none' : after.merchantContract.lapsed ? 'lapsed' : 'active',
        mode: after.gameMode,
        alive: after.isAlive,
        hpPct: after.stats.maxHp > 0 ? after.stats.currentHp / after.stats.maxHp : 0,
        mobCount: after.mobs.length,
        targetDist: tgt ? Math.hypot(tgt.offset.dx, tgt.offset.dy) : null,
        zoneKills: after.totalZoneKills[after.currentZone] ?? 0,
        pos: { ...after.playerMapPos },
      })
    }
  }

  return {
    opts: o,
    samples,
    final: samples[samples.length - 1],
    firstFullAtMinute,
    wallMs: Date.now() - started,
  }
}

// ── Invariants ────────────────────────────────────────────────────────────────
// Checked every tick, not every sample: the properties below are the ones the T1
// work claims, and a claim that is only spot-checked at 5-minute boundaries is not
// checked at all. Run with `--assert`.

export interface Violation {
  tick: number
  minute: number
  rule: string
  detail: string
}

const DESTROY_PATTERNS = [
  // The exact strings the old code logged when it deleted a drop. If either can still
  // appear, loot is still being destroyed somewhere.
  'Bag full! Lost:',
  'crafted — bags full!',
]

export function runInvariants(opts: ScenarioOpts): Violation[] {
  const o: Required<ScenarioOpts> = {
    playerClass: 'warrior', playerRace: 'human', stepSeconds: 0.25,
    sampleEveryMinutes: 5, advanceZones: false, sellCommons: false,
    buyBagSlots: false, buyContract: false, autoEquip: false,
    disableAutoEquip: false, seed: null, ...opts,
  }
  if (typeof __setSeed === 'function') __setSeed(o.seed)

  const store = useGameStore
  store.getState().initGame(o.playerClass, o.playerRace)

  const readNewLogs = makeLogReader()
  const violations: Violation[] = []
  const totalTicks = Math.round((o.minutes * 60) / o.stepSeconds)
  const ticksPerSample = Math.round((o.sampleEveryMinutes * 60) / o.stepSeconds)
  let prevSalvaged = 0
  let prevSlots = 0
  let prevUpkeep = 0
  let prevAutoSold = 0

  const fail = (t: number, rule: string, detail: string) => {
    // One report per rule keeps a systemic break from burying the others.
    if (violations.some(v => v.rule === rule)) return
    violations.push({ tick: t, minute: (t * o.stepSeconds) / 60, rule, detail })
  }

  for (let t = 1; t <= totalTicks; t++) {
    store.getState().tick(o.stepSeconds)
    const s = store.getState()

    for (const msg of readNewLogs(s.combatLog)) {
      for (const pattern of DESTROY_PATTERNS) {
        if (msg.includes(pattern)) fail(t, 'loot is never destroyed', `log said: "${msg}"`)
      }
    }

    if (s.gold < 0) fail(t, 'gold never goes negative', `gold=${s.gold}`)
    if (s.totalSalvaged < prevSalvaged) {
      fail(t, 'salvage ledger only grows', `${prevSalvaged} → ${s.totalSalvaged}`)
    }
    prevSalvaged = s.totalSalvaged

    // Capacity is stored twice — as the array length and as the purchase counter — so
    // they have to agree or the bag silently gains or loses room.
    const expected = INVENTORY_SLOTS + s.bagSlotsPurchased
    if (s.inventory.length !== expected) {
      fail(t, 'bag length matches slots bought',
        `length=${s.inventory.length} expected=${expected} (bought ${s.bagSlotsPurchased})`)
    }
    if (s.bagSlotsPurchased > BAG_SLOTS_MAX_PURCHASED) {
      fail(t, 'purchased slots respect the ceiling', `bought ${s.bagSlotsPurchased}`)
    }
    if (s.bagSlotsPurchased < prevSlots) {
      fail(t, 'bought slots are never lost', `${prevSlots} → ${s.bagSlotsPurchased}`)
    }
    prevSlots = s.bagSlotsPurchased

    // ── The merchant contract's promises ──────────────────────────────────────
    if (s.totalUpkeepPaid < prevUpkeep) {
      fail(t, 'upkeep ledger only grows', `${prevUpkeep} → ${s.totalUpkeepPaid}`)
    }
    prevUpkeep = s.totalUpkeepPaid
    if (s.totalAutoSold < prevAutoSold) {
      fail(t, 'factor earnings only grow', `${prevAutoSold} → ${s.totalAutoSold}`)
    }
    prevAutoSold = s.totalAutoSold
    // The whole point of billing a cut rather than a flat fee: the arrangement can never
    // be a losing deal. Slack of MERCHANT_UPKEEP_MIN per bill covers the floor charge.
    if (s.totalAutoSold > 0 && s.totalUpkeepPaid > s.totalAutoSold) {
      fail(t, 'the factor never costs more than it earns',
        `earned ${s.totalAutoSold}, upkeep ${s.totalUpkeepPaid}`)
    }
    if (s.merchantContract && s.merchantContract.soldSinceBill < 0) {
      fail(t, 'unbilled sales are never negative', `${s.merchantContract.soldSinceBill}`)
    }

    if (t % ticksPerSample === 0) {
      if (o.sellCommons) store.getState().sellAllCommon()
      if (o.buyBagSlots || o.buyContract) {
        const townId = townForZone(store.getState().currentZone)
        if (townId) {
          store.getState().enterTown(townId as TownId)
          for (let n = 0; n < BAG_SLOTS_MAX_PURCHASED; n++) {
            const before = store.getState().bagSlotsPurchased
            store.getState().buyBagSlot()
            if (store.getState().bagSlotsPurchased === before) break
          }
          store.getState().leaveTown()
        }
      }
    }
  }
  return violations
}

// ── Save migration ────────────────────────────────────────────────────────────
// Bag capacity is now stored in two places that must agree: the inventory array's
// length and the `bagSlotsPurchased` counter. Every save written before this change
// has the array and not the counter, so `rehydrateState` has to reconcile them — and
// getting that wrong either shrinks a paid-for bag or deletes the items in it. This
// drives the real save path (slotStorage → loadSlot) rather than trusting the reader.

export function runSaveMigration(): Violation[] {
  const out: Violation[] = []
  const store = useGameStore
  const fail = (rule: string, detail: string) => out.push({ tick: 0, minute: 0, rule, detail })

  if (typeof __setSeed === 'function') __setSeed(99)
  store.getState().initGame('warrior', 'human')

  // Play a while so there is loot to preserve, then buy capacity.
  for (let i = 0; i < 4 * 60 * 20; i++) store.getState().tick(0.25)
  const townId = townForZone(store.getState().currentZone)
  if (townId) {
    store.getState().enterTown(townId as TownId)
    for (let n = 0; n < 3; n++) store.getState().buyBagSlot()
    store.getState().leaveTown()
  }
  const bought = store.getState().bagSlotsPurchased
  if (bought === 0) fail('setup bought slots', 'no slots affordable — test proves nothing')

  store.getState().saveGame()
  const slotId = slotStorage.list()[0]?.id
  if (!slotId) { fail('save produced a slot', 'slotStorage.list() empty'); return out }

  // (1) Round-trip: a current save must come back byte-identical in capacity terms.
  const expectedCapacity = INVENTORY_SLOTS + bought
  const expectedItems = store.getState().inventory.filter(Boolean).length
  store.getState().loadSlot(slotId)
  if (store.getState().bagSlotsPurchased !== bought) {
    fail('round-trip keeps bought slots', `${bought} → ${store.getState().bagSlotsPurchased}`)
  }
  if (store.getState().inventory.length !== expectedCapacity) {
    fail('round-trip keeps capacity', `${expectedCapacity} → ${store.getState().inventory.length}`)
  }
  if (store.getState().inventory.filter(Boolean).length !== expectedItems) {
    fail('round-trip keeps items', `${expectedItems} → ${store.getState().inventory.filter(Boolean).length}`)
  }

  // (2) Legacy save: strip the fields this change introduced, exactly as a blob written
  // by the previous build would look, and confirm it loads as the 20-slot bag it was.
  const slot = slotStorage.load(slotId)!
  const legacy = JSON.parse(JSON.stringify(slot)) as typeof slot
  delete (legacy.state as Partial<typeof legacy.state>).bagSlotsPurchased
  delete (legacy.state as Partial<typeof legacy.state>).totalSalvaged
  legacy.state.inventory = legacy.state.inventory.slice(0, INVENTORY_SLOTS)
  const legacyItems = legacy.state.inventory.filter(Boolean).length
  slotStorage.save(legacy)
  store.getState().loadSlot(slotId)
  const after = store.getState()
  if (after.bagSlotsPurchased !== 0) fail('legacy save has no bought slots', `got ${after.bagSlotsPurchased}`)
  if (after.totalSalvaged !== 0) fail('legacy save starts an empty ledger', `got ${after.totalSalvaged}`)
  if (after.inventory.length !== INVENTORY_SLOTS) {
    fail('legacy save keeps its 20 slots', `got ${after.inventory.length}`)
  }
  if (after.inventory.filter(Boolean).length !== legacyItems) {
    fail('legacy save keeps its items', `${legacyItems} → ${after.inventory.filter(Boolean).length}`)
  }

  // (3) Over-long array (a save that somehow holds more items than it paid for): items
  // must survive, because deleting a player's loot to satisfy a counter is the worse bug.
  const over = JSON.parse(JSON.stringify(slotStorage.load(slotId)!)) as typeof slot
  ;(over.state as { bagSlotsPurchased: number }).bagSlotsPurchased = 0
  const filler = store.getState().inventory.filter(Boolean).slice(0, 3)
  over.state.inventory = [...over.state.inventory, ...filler]
  const overItems = over.state.inventory.filter(Boolean).length
  slotStorage.save(over)
  store.getState().loadSlot(slotId)
  if (store.getState().inventory.filter(Boolean).length !== overItems) {
    fail('over-long save keeps every item',
      `${overItems} → ${store.getState().inventory.filter(Boolean).length}`)
  }

  return out
}

// ── Offline parity ────────────────────────────────────────────────────────────
//
// The claim offline progress makes is exact: being away pays what being present paid.
// That is checkable rather than arguable — play online for a window, measure what it
// produced, then ask the projection what the SAME window is worth and compare.
//
// A tolerance is unavoidable and it is not a fudge: the online run is one noisy sample of
// a random process (crit rolls, drop rolls, elite spawns, deaths), while the projection
// returns that process's mean. They should agree in expectation, not to the gold.

/** How far the MEAN error may sit from zero before it stops being noise. */
export const MEAN_TOLERANCE = 0.10

export interface ParityResult {
  seed: number
  onlineGold: number
  offlineGold: number
  onlineKills: number
  offlineKills: number
  /** Signed relative error of the offline grant against the online run. */
  goldError: number
  killError: number
}

export function runOfflineParity(
  minutes: number, seed: number, stepSeconds = 0.25, warmupMinutes = 30,
): ParityResult {
  if (typeof __setSeed === 'function') __setSeed(seed)
  const store = useGameStore
  store.getState().initGame('warrior', 'human')

  // Warm the rate record up on a stretch of real play. A LONG warmup settles the hero's
  // level, which is the control for whether any residual error is progression or bias.
  const warmupTicks = Math.round((warmupMinutes * 60) / stepSeconds)
  for (let t = 0; t < warmupTicks; t++) store.getState().tick(stepSeconds)

  // Snapshot, then play the measured window ONLINE.
  const before = store.getState()
  const snapshot = JSON.parse(JSON.stringify({
    gold: before.gold, kills: totalKills(before), rates: before.offlineRates,
  }))
  const windowTicks = Math.round((minutes * 60) / stepSeconds)
  for (let t = 0; t < windowTicks; t++) store.getState().tick(stepSeconds)
  const after = store.getState()
  const onlineGold = after.gold - snapshot.gold
  const onlineKills = totalKills(after) - snapshot.kills

  // Now ask the projection what that same window was worth, from the same starting rates.
  // `lastTickTimestamp` is back-dated by exactly the window so the elapsed time matches.
  const probe: GameState = {
    ...JSON.parse(JSON.stringify(before)),
    offlineRates: snapshot.rates,
    lastTickTimestamp: Date.now() - minutes * 60 * 1000,
  }
  const outcome = projectOfflineProgress(probe, Date.now())
  const offlineGold = outcome ? outcome.report.gold : 0
  const offlineKills = outcome ? outcome.report.kills : 0

  return {
    seed, onlineGold, offlineGold, onlineKills, offlineKills,
    goldError: onlineGold > 0 ? (offlineGold - onlineGold) / onlineGold : 0,
    killError: onlineKills > 0 ? (offlineKills - onlineKills) / onlineKills : 0,
  }
}

function totalKills(s: GameState): number {
  return Object.values(s.totalZoneKills).reduce((a, b) => a + (b ?? 0), 0)
}

export function formatParity(rs: ParityResult[], minutes: number, tolerance: number): string {
  const out: string[] = []
  out.push(`offline parity: ${minutes}-minute window, ${rs.length} seeds, tolerance ±${Math.round(tolerance * 100)}%`)
  out.push('')
  out.push([pad('seed', 6), pad('online g', 10), pad('offline g', 10), pad('gold err', 10),
            pad('online k', 9), pad('offline k', 10), pad('kill err', 9)].join(' '))
  out.push('-'.repeat(70))
  let failed = 0
  for (const r of rs) {
    const bad = Math.abs(r.goldError) > tolerance
    if (bad) failed++
    out.push([pad(r.seed, 6), pad(r.onlineGold, 10), pad(r.offlineGold, 10),
              pad(`${(r.goldError * 100).toFixed(1)}%${bad ? ' !' : ''}`, 10),
              pad(r.onlineKills, 9), pad(r.offlineKills, 10),
              pad(`${(r.killError * 100).toFixed(1)}%`, 9)].join(' '))
  }
  const meanGold = rs.reduce((a, r) => a + r.goldError, 0) / rs.length
  const meanKill = rs.reduce((a, r) => a + r.killError, 0) / rs.length
  out.push('')
  // The claim is about the MEAN, not any one run. A single online window is one sample of
  // a noisy process — crit rolls, drop rolls, elite spawns, deaths — while the projection
  // returns that process's expectation. Per-seed spread of ±25% is the process, not a bug;
  // a mean that keeps landing on one side is the bug, because it means a systematic
  // discount or bonus, and parity 1.0 forbids both.
  out.push(`per-seed spread is sampling noise; the parity claim is about the mean.`)
  out.push(`mean gold error ${(meanGold * 100).toFixed(1)}%   mean kill error ${(meanKill * 100).toFixed(1)}%`)
  out.push(`${failed}/${rs.length} individual seeds outside ±${Math.round(tolerance * 100)}%`)
  const biased = Math.abs(meanGold) > MEAN_TOLERANCE
  out.push(biased
    ? `FAIL — mean is outside ±${Math.round(MEAN_TOLERANCE * 100)}%, which is bias rather than noise`
    : `ok — no systematic discount or bonus (mean within ±${Math.round(MEAN_TOLERANCE * 100)}%)`)
  return out.join('\n')
}

// ── Stall detection ───────────────────────────────────────────────────────────
// An idle game's cardinal failure is a run that stops progressing while nobody is
// watching. A "stall" here is deliberately strict: gold did not move at all across
// consecutive samples through to the end of the run. Anything slow-but-alive is
// not a stall.

export interface StallVerdict {
  stalled: boolean
  /** Simulated minute progress last moved. */
  lastProgressMinute: number
  /** Simulated minutes spent frozen at the end of the run. */
  frozenMinutes: number
  /** The state the run froze in — the diagnosis. */
  frozenIn: string | null
}

export function detectStall(r: ScenarioResult): StallVerdict {
  const s = r.samples
  if (s.length < 2) return { stalled: false, lastProgressMinute: 0, frozenMinutes: 0, frozenIn: null }
  let last = 0
  for (let i = 1; i < s.length; i++) {
    if (s[i].gold !== s[i - 1].gold || s[i].zoneKills !== s[i - 1].zoneKills) last = s[i].minute
  }
  const frozen = s[s.length - 1].minute - last
  // Two consecutive dead samples is the threshold; one can be an unlucky window.
  const stalled = frozen >= 2 * r.opts.sampleEveryMinutes
  return {
    stalled,
    lastProgressMinute: last,
    frozenMinutes: frozen,
    frozenIn: stalled ? `${s[s.length - 1].alive ? s[s.length - 1].mode : 'dead'}` : null,
  }
}

export interface SweepResult {
  runs: { seed: number; verdict: StallVerdict; final: Sample }[]
  stalledCount: number
  total: number
}

/** Run the same scenario across N seeds and report how many soft-lock. */
export function runSweep(base: ScenarioOpts, seeds: number[]): SweepResult {
  const runs = seeds.map(seed => {
    const r = runScenario({ ...base, seed })
    return { seed, verdict: detectStall(r), final: r.final }
  })
  return { runs, stalledCount: runs.filter(x => x.verdict.stalled).length, total: runs.length }
}

export function formatSweep(sw: SweepResult, minutes: number): string {
  const out: string[] = []
  out.push(`sweep: ${sw.total} seeds × ${minutes} simulated minutes`)
  out.push('')
  out.push([pad('seed', 6), pad('stalled', 8), pad('froze@min', 10), pad('frozenFor', 10),
            pad('state', 10, true), pad('gold', 8), pad('lvl', 4), pad('lost', 6)].join(' '))
  out.push('-'.repeat(70))
  for (const { seed, verdict, final } of sw.runs) {
    out.push([pad(seed, 6), pad(verdict.stalled ? 'YES' : 'no', 8),
              pad(verdict.stalled ? verdict.lastProgressMinute.toFixed(0) : '-', 10),
              pad(verdict.stalled ? `${verdict.frozenMinutes.toFixed(0)}min` : '-', 10),
              pad(verdict.frozenIn ?? '-', 10, true), pad(final.gold, 8),
              pad(final.level, 4), pad(final.itemsLost, 6)].join(' '))
  }
  out.push('')
  const pct = (100 * sw.stalledCount) / sw.total
  out.push(`SOFT-LOCKED: ${sw.stalledCount}/${sw.total} runs (${pct.toFixed(0)}%)`)
  const alive = sw.runs.filter(r => !r.verdict.stalled)
  if (alive.length) {
    const avgGold = alive.reduce((a, r) => a + r.final.gold, 0) / alive.length
    const avgLost = alive.reduce((a, r) => a + r.final.itemsLost, 0) / alive.length
    const avgLoot = alive.reduce((a, r) => a + r.final.itemsLooted, 0) / alive.length
    out.push(`healthy runs: avg ${avgGold.toFixed(0)}g (${(avgGold / minutes).toFixed(1)}/min), ` +
             `${avgLoot.toFixed(0)} kept / ${avgLost.toFixed(0)} destroyed ` +
             `(${(100 * avgLost / (avgLoot + avgLost)).toFixed(0)}% of drops lost)`)
  }
  return out.join('\n')
}

// ── Report ────────────────────────────────────────────────────────────────────

function pad(s: string | number, w: number, left = false): string {
  const str = String(s)
  return left ? str.padEnd(w) : str.padStart(w)
}

export function formatReport(r: ScenarioResult): string {
  const out: string[] = []
  const o = r.opts
  out.push(
    `scenario: ${o.minutes}min  class=${o.playerClass}/${o.playerRace}  step=${o.stepSeconds}s` +
    `  advanceZones=${o.advanceZones}  sellCommons=${o.sellCommons}  (${r.wallMs}ms wall)`,
  )
  out.push('')
  out.push(
    [pad('min', 6), pad('lvl', 4), pad('zone', 20, true), pad('gold', 9), pad('g/min', 8),
     pad('bag', 7), pad('loot', 6), pad('ovf', 6), pad('ovfVal', 8), pad('salv$', 8), pad('+slot', 6), pad('factor', 7), pad('sold$', 8), pad('upkeep', 7),
     pad('mode', 10, true), pad('hp%', 5), pad('mobs', 5), pad('dist', 6), pad('kills', 6),
     pad('pos', 14)].join(' '),
  )
  out.push('-'.repeat(170))

  let prevGold = 0
  let prevMin = 0
  for (const s of r.samples) {
    const rate = (s.gold - prevGold) / Math.max(1e-9, s.minute - prevMin)
    out.push(
      [pad(s.minute.toFixed(0), 6), pad(s.level, 4), pad(s.zone, 20, true),
       pad(s.gold, 9), pad(rate.toFixed(1), 8), pad(`${s.bagUsed}/${s.bagSize}`, 7),
       pad(s.itemsLooted, 6), pad(s.itemsLost, 6), pad(Math.round(s.lostValueEst), 8),
       pad(s.salvagedGold, 8), pad(s.bagSlotsBought, 6),
       pad(s.contract, 7), pad(s.autoSold, 8), pad(s.upkeepPaid, 7),
       pad(s.alive ? s.mode : 'DEAD', 10, true), pad((s.hpPct * 100).toFixed(0), 5),
       pad(s.mobCount, 5), pad(s.targetDist === null ? '-' : s.targetDist.toFixed(1), 6),
       pad(s.zoneKills, 6), pad(`${s.pos.x.toFixed(2)},${s.pos.y.toFixed(2)}`, 14)].join(' '),
    )
    prevGold = s.gold
    prevMin = s.minute
  }

  const f = r.final
  out.push('')
  out.push(`bag first full at: ${r.firstFullAtMinute === null ? 'never' : `${r.firstFullAtMinute.toFixed(1)} min`}` +
           `  (capacity ${INVENTORY_SLOTS})`)
  out.push(`gold earned:       ${f.gold}  (${(f.gold / f.minute).toFixed(1)}/min average)`)
  out.push(`items kept:        ${f.itemsLooted}`)
  out.push(`items overflowed:  ${f.itemsLost}  (~${Math.round(f.lostValueEst)}g of modelled vendor value)`)
  out.push(`salvage recovered: ${f.salvagedGold}g` +
           (f.lostValueEst > 0 ? `  (${(100 * f.salvagedGold / f.lostValueEst).toFixed(0)}% of it — the rest is what capacity buys)` : ''))
  out.push(`value DESTROYED:   ${Math.round(f.lostValueEst) - f.salvagedGold}g modelled` +
           (f.salvagedGold > 0 ? ' — none of it silently' : ''))
  out.push(`bag slots bought:  ${f.bagSlotsBought}  (capacity ${f.bagSize})`)
  if (f.contract !== 'none' || f.autoSold > 0) {
    out.push(`merchant contract: ${f.contract} — earned ${f.autoSold}g, upkeep ${f.upkeepPaid}g, ` +
             `NET ${f.autoSold - f.upkeepPaid >= 0 ? '+' : ''}${f.autoSold - f.upkeepPaid}g`)
  }
  out.push(`deaths:            ${f.deaths}`)
  return out.join('\n')
}
