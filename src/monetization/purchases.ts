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

export interface PurchaseState {
  /** True once configure() has resolved (or been skipped on web). */
  ready: boolean
  /** RevenueCat entitlement ids currently active. */
  active: ReadonlySet<string>
  /** Localized price string for the founder pack, or null if offerings aren't loaded. */
  founderPrice: string | null
  /** Last user-facing error, or null. */
  error: string | null
  /** True while a purchase or restore is in flight. */
  busy: boolean
}

let state: PurchaseState = {
  ready: false, active: new Set(), founderPrice: null, error: null, busy: false,
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

/** Fetch the price string for the paywall. Best-effort. */
export async function loadOfferings(): Promise<void> {
  if (!isNative) return
  try {
    const Purchases = await plugin()
    const { current } = await Purchases.getOfferings()
    const pkg = current?.availablePackages?.[0]
    if (pkg) set({ founderPrice: pkg.product.priceString })
  } catch (e) {
    console.warn('[iap] getOfferings failed', e)
  }
}

/**
 * Buy the founder pack. Resolves true if the entitlement is active afterwards.
 * A user cancellation is NOT an error and must not show one.
 */
export async function buyFounderPack(): Promise<boolean> {
  if (!isNative) {
    set({ error: 'In-app purchases are only available in the app.' })
    return false
  }
  set({ busy: true, error: null })
  try {
    const Purchases = await plugin()
    const { current } = await Purchases.getOfferings()
    const pkg = current?.availablePackages?.[0]
    if (!pkg) { set({ busy: false, error: 'Store unavailable. Try again shortly.' }); return false }
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg })
    const active = activeFrom(customerInfo)
    set({ busy: false, active })
    return active.has(FOUNDER_ENTITLEMENT)
  } catch (e) {
    const cancelled = !!(e as { code?: string; userCancelled?: boolean })?.userCancelled
      || (e as { code?: string })?.code === '1'
    set({ busy: false, error: cancelled ? null : 'Purchase could not be completed.' })
    if (!cancelled) console.error('[iap] purchase failed', e)
    return false
  }
}

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

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __ilGrant?: (ids: string[]) => void }).__ilGrant = __devGrant
}
