// RevenueCat integration — the entire monetization surface.
//
// Design rules this obeys, from PLAN.md Track M:
//   - Cosmetic only. Nothing here can change throughput, drop rates or progression; the
//     only thing an entitlement unlocks is a set of palette slot overrides (colorways.ts).
//   - No gambling. Direct purchase of a named, previewable pack — no randomised paid
//     items, so no odds disclosure and no age-rating change.
//   - Restore Purchases must exist and work (App Store 3.1.x is a hard requirement).
//
// Failure policy: monetization must never be able to break the game. Every call is
// guarded, every failure resolves to "no entitlements", and the store subscribes rather
// than blocking on it. Worst case the player sees only the free colorways.

import { Capacitor } from '@capacitor/core'
import { FOUNDER_ENTITLEMENT } from '../render/colorways'

/**
 * Standing Orders — a permanent extension to how long the hero will range unsupervised.
 *
 * This is the first SKU that is not cosmetic, and that is a deliberate reversal of the
 * original Track M principle ("sells the art and its scarcity — not power, not progress
 * relief"). The reasoning, recorded here because the header above still states the old
 * rule and a future reader deserves to know it was changed on purpose rather than
 * forgotten: the art thesis cannot fund the game yet. The rigs are placeholders, the
 * de-pooling is unfinished, and there is no PvP display case — so a cosmetic economy would
 * be selling palette swaps of placeholder sprites to an audience of one. Idle players
 * convert on time, not on skins.
 *
 * What is NOT being done, and why the shape matters:
 *   • It is a ONE-TIME permanent upgrade, not a consumable refill and not a currency. No
 *     gem ledger, no dual pricing, nothing to top up — which keeps principle 3 (real-money
 *     pricing, no opaque currency) and stays clear of the regulator-hostile direction.
 *   • The free cap stays GENEROUS (8h) and still binds on almost nobody. This sells more
 *     of a good thing to the people who hit the ceiling; it does not manufacture a
 *     ceiling in order to sell relief from it.
 */
export const STANDING_ORDERS_ENTITLEMENT = 'standing_orders'

/** Permanent offline hours the Standing Orders entitlement grants. */
export const STANDING_ORDERS_HOURS = 8

/**
 * Permanent watch hours the player's entitlements are worth.
 *
 * Takes the active set as an argument rather than reading module state, so the engine and
 * the headless sim can call it with an empty set and get the honest free-tier answer.
 */
export function purchasedWatchHours(active: ReadonlySet<string>): number {
  return active.has(STANDING_ORDERS_ENTITLEMENT) ? STANDING_ORDERS_HOURS : 0
}

export interface PurchaseState {
  /** True once configure() has resolved (or been skipped on web). */
  ready: boolean
  /** RevenueCat entitlement ids currently active. */
  active: ReadonlySet<string>
  /** Localized price string for the founder pack, or null if offerings aren't loaded. */
  founderPrice: string | null
  /** Localized price for Standing Orders, or null if offerings aren't loaded. */
  standingOrdersPrice: string | null
  /** Last user-facing error, or null. */
  error: string | null
  /** True while a purchase or restore is in flight. */
  busy: boolean
}

let state: PurchaseState = {
  ready: false, active: new Set(), founderPrice: null, standingOrdersPrice: null,
  error: null, busy: false,
}

type Listener = (s: PurchaseState) => void
const listeners = new Set<Listener>()

function set(patch: Partial<PurchaseState>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l(state)
}

export function getPurchaseState(): PurchaseState { return state }

export function subscribePurchases(fn: Listener): () => void {
  listeners.add(fn)
  fn(state)
  return () => { listeners.delete(fn) }
}

/**
 * The plugin is a native bridge — on the web build there is no StoreKit behind it, and
 * calling it throws. The web/dev build therefore runs with zero entitlements, which is
 * also the correct default: it exercises the locked path, which is the one that has to
 * be right.
 */
const isNative = Capacitor.isNativePlatform()

/** Cached dynamic import so the RevenueCat bundle never loads in a browser session. */
async function plugin() {
  const mod = await import('@revenuecat/purchases-capacitor')
  return mod.Purchases
}

function activeFrom(info: { entitlements: { active: Record<string, unknown> } }): Set<string> {
  return new Set(Object.keys(info?.entitlements?.active ?? {}))
}

/** Call once at boot. Never throws. */
export async function initPurchases(): Promise<void> {
  if (!isNative) {
    // Not an error — just nothing to configure.
    set({ ready: true })
    return
  }
  const apiKey = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined
  if (!apiKey) {
    console.warn('[iap] VITE_REVENUECAT_IOS_KEY is unset — running with no entitlements')
    set({ ready: true, error: null })
    return
  }
  try {
    const Purchases = await plugin()
    await Purchases.configure({ apiKey })
    const { customerInfo } = await Purchases.getCustomerInfo()
    set({ ready: true, active: activeFrom(customerInfo) })
    void loadOfferings()
  } catch (e) {
    console.error('[iap] configure failed', e)
    set({ ready: true, error: null })   // silent: a store outage is not the player's problem
  }
}

/**
 * Find a package in the current offering.
 *
 * There are two SKUs now, so `availablePackages[0]` is no longer an answer — it silently
 * became "whichever product RevenueCat happens to list first", which would sell the wrong
 * thing the moment the dashboard reordered. Matched on identifier instead — against the
 * PACKAGE identifier or the PRODUCT identifier, because the dashboard constrains package
 * identifiers to a preset list plus "Custom" and a future editor may not keep ours.
 *
 * **The first-package fallback is gone (2026-08-22).** It existed for the era when the
 * offering held a single product, and it had become a live hazard: with two packages
 * configured, a founder lookup that missed would return `availablePackages[0]` — which is
 * whatever RevenueCat listed first, i.e. possibly Standing Orders. That is a paywall
 * showing the wrong price and charging for the wrong thing, and it fails silently. A
 * missing package must read as "store unavailable", never as "here is a different SKU".
 */
type Pkg = { identifier?: string; product: { identifier?: string; priceString: string } }
function findPackage(pkgs: Pkg[] | undefined, needle: string): Pkg | undefined {
  return pkgs?.find(p =>
    (p.identifier ?? '').toLowerCase().includes(needle) ||
    (p.product?.identifier ?? '').toLowerCase().includes(needle))
}

/** Fetch the price strings for the paywalls. Best-effort. */
export async function loadOfferings(): Promise<void> {
  if (!isNative) return
  try {
    const Purchases = await plugin()
    const { current } = await Purchases.getOfferings()
    const pkgs = current?.availablePackages as Pkg[] | undefined
    const founder = findPackage(pkgs, 'founder')
    const watch = findPackage(pkgs, 'standing')
    set({
      founderPrice: founder?.product?.priceString ?? null,
      standingOrdersPrice: watch?.product?.priceString ?? null,
    })
  } catch (e) {
    console.warn('[iap] getOfferings failed', e)
  }
}

/**
 * Buy one SKU. Resolves true if `entitlement` is active afterwards.
 * A user cancellation is NOT an error and must not show one.
 */
async function buy(needle: string, entitlement: string): Promise<boolean> {
  if (!isNative) {
    set({ error: 'In-app purchases are only available in the app.' })
    return false
  }
  set({ busy: true, error: null })
  try {
    const Purchases = await plugin()
    const { current } = await Purchases.getOfferings()
    const pkg = findPackage(current?.availablePackages as Pkg[] | undefined, needle)
    if (!pkg) { set({ busy: false, error: 'Store unavailable. Try again shortly.' }); return false }
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg as never })
    const active = activeFrom(customerInfo)
    set({ busy: false, active })
    return active.has(entitlement)
  } catch (e) {
    const cancelled = !!(e as { code?: string; userCancelled?: boolean })?.userCancelled
      || (e as { code?: string })?.code === '1'
    set({ busy: false, error: cancelled ? null : 'Purchase could not be completed.' })
    if (!cancelled) console.error('[iap] purchase failed', e)
    return false
  }
}

export const buyFounderPack = () => buy('founder', FOUNDER_ENTITLEMENT)
/** Buy Standing Orders — permanent watch capacity. See STANDING_ORDERS_ENTITLEMENT. */
export const buyStandingOrders = () => buy('standing', STANDING_ORDERS_ENTITLEMENT)

/**
 * Restore Purchases. Apple requires this to exist and to be reachable without a purchase,
 * for players who reinstall or switch device.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!isNative) {
    set({ error: 'Restore is only available in the app.' })
    return false
  }
  set({ busy: true, error: null })
  try {
    const Purchases = await plugin()
    const { customerInfo } = await Purchases.restorePurchases()
    const active = activeFrom(customerInfo)
    set({ busy: false, active, error: active.size ? null : 'No previous purchases found.' })
    return active.has(FOUNDER_ENTITLEMENT)
  } catch (e) {
    console.error('[iap] restore failed', e)
    set({ busy: false, error: 'Could not reach the store.' })
    return false
  }
}

/**
 * Test seam: force entitlements on without StoreKit, so the UNLOCKED path can be
 * exercised in a browser. Guarded by `import.meta.env.DEV`, which is the literal `false`
 * in a release build — so this function and its window binding are both stripped, and no
 * shipped bundle contains a way to grant an entitlement for free.
 */
export function __devGrant(ids: string[]): void {
  if (!import.meta.env.DEV) return
  set({ active: new Set(ids) })
}

/**
 * Test seam: supply the localized price strings StoreKit would have returned, so the SKU
 * buttons render in a browser. They are gated on a non-null price precisely because a
 * priceless button could only ever fail — which also means the App Store review
 * screenshots cannot be captured off the web build without this. Same `import.meta.env
 * .DEV` guard as __devGrant, so it is stripped from every release bundle.
 */
export function __devPrices(founder: string | null, standing: string | null): void {
  if (!import.meta.env.DEV) return
  set({ ready: true, founderPrice: founder, standingOrdersPrice: standing })
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as {
    __ilGrant?: (ids: string[]) => void
    __ilPrices?: (f: string | null, s: string | null) => void
  }
  w.__ilGrant = __devGrant
  w.__ilPrices = __devPrices
}
