import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { watchExtendCost, watchCapacitySeconds } from '../../engine/offline'
import { compileUpgrades } from '../../data/upgrades'
import { compileUniques } from '../../data/uniques'
import {
  getPurchaseState, purchasedWatchHours, subscribePurchases, buyStandingOrders,
  STANDING_ORDERS_ENTITLEMENT, STANDING_ORDERS_HOURS,
} from '../../monetization/purchases'
import { WATCH_BANK_CAP_HOURS, WATCH_EXTEND_HOURS } from '../../data/constants'
import { SpriteIcon } from '../ui/SpriteIcon'

/**
 * The Watch — how long the hero keeps going after you close the app.
 *
 * This resource has existed since offline progress shipped (`OFFLINE_CAP_HOURS`) and was
 * never once shown to the player. That is the whole reason it motivated nothing: an idle
 * game's central promise is "it keeps running without you", and the number that governs
 * exactly how long was legible only in the source.
 *
 * Read as one bar with two segments, because they behave differently and the player has to
 * be able to tell them apart:
 *   • the STANDING watch (gold) — free base + Long Watch ranks + Standing Orders. Permanent.
 *   • the BANKED extension (pale) — bought per trip, spent by the absence that uses it.
 */
function span(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h <= 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function WatchMeterInner() {
  // Entitlements live outside the store (they are RevenueCat's truth, not the save's), so
  // this subscribes rather than reading once — otherwise a purchase or a restore would not
  // repaint the meter it just changed.
  const [purchases, setPurchases] = React.useState(getPurchaseState)
  React.useEffect(() => subscribePurchases(setPurchases), [])

  const upgradeRanks = useGameStore(s => s.upgradeRanks)
  const equipment = useGameStore(s => s.equipment)
  const bonusSeconds = useGameStore(s => s.watchBonusSeconds)
  const extendWatch = useGameStore(s => s.extendWatch)

  // ── Why this component is so careful about what it subscribes to ──────────────
  // Gold changes on every kill — several times a second in a fight — and a naive
  // `useGameStore(s => s.gold)` re-runs this whole component that often. It showed up in a
  // CPU profile of the render loop at 1.9% of self time, more than `drawImage`: a static
  // readout in a side rail costing more than the world it sits next to.
  //
  // Two fixes. Subscribe to the DERIVED boolean rather than the number, so a re-render
  // happens when affordability flips rather than on every coin; and memoise the two
  // `compile*` passes, which walk the upgrade table and every equipped item and depend on
  // none of it.
  const permanentHours = React.useMemo(() =>
    compileUpgrades(upgradeRanks).offlineHours +
    compileUniques(equipment).offlineHours +
    // Live from the billing cache, like every other entitlement gate in the app.
    purchasedWatchHours(purchases.active),
    [upgradeRanks, equipment, purchases.active])

  const cap = React.useMemo(
    () => watchCapacitySeconds({ watchBonusSeconds: bonusSeconds } as never, permanentHours),
    [bonusSeconds, permanentHours])

  const bankCap = WATCH_BANK_CAP_HOURS * 3600
  const full = cap.banked >= bankCap
  const cost = watchExtendCost(cap.banked)
  const afford = useGameStore(s => s.gold >= cost)

  // The banked segment is drawn against the bank's OWN ceiling rather than against total
  // capacity, so buying the first extension moves the bar visibly instead of adding a
  // sliver next to eight hours of base.
  const basePct = (cap.base / (cap.base + bankCap)) * 100
  const bankPct = (cap.banked / (cap.base + bankCap)) * 100

  return (
    <div className="watch-meter">
      <div className="watch-meter-head">
        <SpriteIcon icon="hourglass" size={12} />
        <span className="watch-meter-title">The Watch</span>
        <span className="watch-meter-total">{span(cap.total)}</span>
      </div>

      <div className="watch-meter-track" role="img"
           aria-label={`Unattended time ${span(cap.total)}: ${span(cap.base)} standing, ${span(cap.banked)} banked`}>
        <div className="watch-meter-fill is-base" style={{ width: `${basePct}%` }} />
        <div className="watch-meter-fill is-bank" style={{ width: `${bankPct}%` }} />
      </div>

      <div className="watch-meter-legend">
        Your hero keeps fighting for {span(cap.total)} after you close the app.
      </div>

      <div className="watch-meter-buy">
        <button
          className="rp-button"
          onClick={() => extendWatch()}
          disabled={full || !afford}
          title={full
            ? `The watch cannot be banked past ${WATCH_BANK_CAP_HOURS}h.`
            : afford
              ? `Bank ${WATCH_EXTEND_HOURS} more hours of unattended time.`
              : `Need ${cost.toLocaleString()}g`}
          style={{ fontSize: '0.55rem', flex: 1, opacity: full || !afford ? 0.5 : 1 }}
        >
          {full ? 'Watch is full' : `Extend +${WATCH_EXTEND_HOURS}h · ${cost.toLocaleString()}g`}
        </button>
      </div>
      {cap.banked > 0 && (
        <div className="watch-meter-banked">{span(cap.banked)} banked — spent only past {span(cap.base)}.</div>
      )}

      {/* Standing Orders — the one permanent, real-money way to raise the ceiling. Shown
          only when it is not already owned, and phrased as MORE rather than as relief: the
          free watch is generous and stays generous, and this doubles it for the players who
          are actually hitting it. Hidden entirely on the web build, where there is no
          StoreKit behind the bridge and the button could only ever fail. */}
      {!purchases.active.has(STANDING_ORDERS_ENTITLEMENT) && purchases.standingOrdersPrice && (
        <button
          className="rp-button watch-meter-sku"
          onClick={() => { void buyStandingOrders() }}
          disabled={purchases.busy}
          title={`Permanently adds ${STANDING_ORDERS_HOURS} hours to every watch.`}
        >
          Standing Orders · +{STANDING_ORDERS_HOURS}h forever
          <span className="watch-meter-sku-price">{purchases.standingOrdersPrice}</span>
        </button>
      )}
      {purchases.active.has(STANDING_ORDERS_ENTITLEMENT) && (
        <div className="watch-meter-banked">Standing Orders held — +{STANDING_ORDERS_HOURS}h, permanently.</div>
      )}
    </div>
  )
}

/**
 * Memoised, and it has to be.
 *
 * The internals are careful about what they subscribe to, but that only controls what
 * makes THIS component re-render on its own — it does nothing about re-rendering because
 * the parent did. `ZoneTrack` watches a good deal of store state and repaints often, and a
 * child re-runs with its parent whether or not anything it reads has changed. It takes no
 * props, so `React.memo` reduces that to zero: the only thing that can repaint the meter
 * now is one of its own selectors actually changing.
 */
export const WatchMeter = React.memo(WatchMeterInner)
