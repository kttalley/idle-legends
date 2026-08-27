import React from 'react'
import {
  buyFounderPack, buyStandingOrders, getPurchaseState, loadOfferings, restorePurchases,
  subscribePurchases, STANDING_ORDERS_ENTITLEMENT, STANDING_ORDERS_HOURS,
} from '../../monetization/purchases'
import { FOUNDER_ENTITLEMENT } from '../../render/colorways'

/**
 * The shop — every purchasable thing, in one place, reachable from the menu on any screen.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * App Review rejected the build under 2.1(b) with "the products in the store failed to
 * load", and the developer's own read of the same build was harsher: there was no
 * affordance for Standing Orders at all. Both were true, for different reasons:
 *
 *   • The Founder Pack lived in the wardrobe, behind a button disabled unless a price had
 *     already arrived.
 *   • Standing Orders lived in the Watch meter, which sits in the zone track — a side rail
 *     on desktop, but on a phone it is inside the map modal. Two taps deep, in a panel
 *     nobody opens to buy something.
 *
 * ── The rule this screen follows ─────────────────────────────────────────────
 * A SKU row is ALWAYS rendered. Not gated on a price, not gated on `ready`. When the price
 * is missing the row says so and offers Retry, because "the button is missing" and "the
 * store is down" look identical to a player and to a reviewer, and only one of them is
 * recoverable by trying again. The previous code hid the row instead, which is how a store
 * outage became indistinguishable from an app that does not sell anything.
 */
function SkuRow({
  title, note, price, owned, ownedNote, busy, onBuy,
}: {
  title: string; note: string; price: string | null; owned: boolean
  ownedNote: string; busy: boolean; onBuy: () => void
}) {
  return (
    <button
      className="rp-button menu-row"
      onClick={owned ? undefined : onBuy}
      disabled={owned || busy || !price}
      aria-disabled={owned || busy || !price}
      style={{ opacity: owned ? 0.75 : 1 }}
    >
      <span>{title}</span>
      <span className="menu-row-value">
        {owned ? 'Owned' : busy ? 'Working…' : price ?? 'Unavailable'}
      </span>
      <span className="menu-row-note">{owned ? ownedNote : note}</span>
    </button>
  )
}

export function ShopView({ onBack }: { onBack: () => void }) {
  const [p, setP] = React.useState(getPurchaseState)
  React.useEffect(() => subscribePurchases(setP), [])

  // Refetch on open. Prices are fetched at boot too, but a brand-new app's products are
  // not vended by StoreKit until the app has been through submission, so the boot fetch of
  // the very first launches returns nothing. Without a refetch here that empty answer
  // sticks for the whole session and the shop is permanently dead.
  React.useEffect(() => { void loadOfferings() }, [])

  const founderOwned = p.active.has(FOUNDER_ENTITLEMENT)
  const standingOwned = p.active.has(STANDING_ORDERS_ENTITLEMENT)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SkuRow
        title="Founder Pack"
        note="Three exclusive colourways and the founder's mark. Cosmetic only — it changes nothing about your progress."
        ownedNote="Held. Your colourways are in the wardrobe."
        price={p.founderPrice}
        owned={founderOwned}
        busy={p.busy}
        onBuy={() => { void buyFounderPack() }}
      />

      <SkuRow
        title="Standing Orders"
        note={`Your hero ranges unsupervised for ${STANDING_ORDERS_HOURS} hours longer. One time, permanent — never a refill.`}
        ownedNote={`Held — +${STANDING_ORDERS_HOURS}h on every watch, permanently.`}
        price={p.standingOrdersPrice}
        owned={standingOwned}
        busy={p.busy}
        onBuy={() => { void buyStandingOrders() }}
      />

      {/* Shown whenever a price is missing, and shown LOUDLY.
          The message from purchases.ts distinguishes a RevenueCat offering problem from
          App Store Connect not vending the product at all — they need opposite fixes.
          It used to render at 0.55rem in muted grey, which on a phone read as decoration:
          the one line written to explain the failure was reported as "no reason shown"
          twice, because nobody could tell it apart from the row description above it.
          It also renders when `error` is somehow null, because "the store failed and did
          not say why" is itself the most diagnostic thing we could report. */}
      {(!p.founderPrice || !p.standingOrdersPrice) && (
        <div style={{
          fontSize: '0.6rem', color: '#e0b070', lineHeight: 1.55,
          border: '1px solid rgba(224,176,112,0.35)', borderRadius: 4,
          padding: '7px 9px', background: 'rgba(0,0,0,0.25)',
          // Selectable so the text can be copied out of a TestFlight build rather than
          // transcribed from a photograph of a phone.
          userSelect: 'text', WebkitUserSelect: 'text',
        }}>
          <div style={{ color: 'var(--gold-soft)', marginBottom: 3 }}>Why there is no price</div>
          {p.error ?? 'The store returned no price and reported no error. That means loadOfferings() never ran — the purchases module was probably never configured.'}
          <div style={{ color: '#9a9086', marginTop: 4 }}>
            ready: {String(p.ready)} · founder: {p.founderPrice ?? 'null'} · standing: {p.standingOrdersPrice ?? 'null'}
          </div>
        </div>
      )}

      {(!p.founderPrice || !p.standingOrdersPrice) && (
        <button
          className="rp-button"
          onClick={() => { void loadOfferings() }}
          style={{ fontSize: '0.62rem', minHeight: 36 }}
        >
          Retry
        </button>
      )}

      {/* Required by App Store 3.1.1 to exist and to be reachable WITHOUT making a
          purchase first, for players who reinstall or change device. */}
      <button
        className="rp-button"
        onClick={() => { void restorePurchases() }}
        disabled={p.busy}
        style={{ fontSize: '0.62rem', minHeight: 36 }}
      >
        Restore Purchases
      </button>

      <button className="rp-button" onClick={onBack} style={{ fontSize: '0.65rem', minHeight: 38 }}>
        Back
      </button>
    </div>
  )
}
