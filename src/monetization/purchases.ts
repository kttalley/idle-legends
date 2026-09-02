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
 * The App Store Connect product identifiers, verbatim (store/SUBMISSION.md §2).
 *
 * These exist because RevenueCat *Offerings* turned out to be the single point of failure
 * for the entire paywall. An Offering is dashboard configuration: products have to be
 * created in RevenueCat, attached to an entitlement, added to an Offering, and that
 * Offering marked "Current". Miss any one of those and `getOfferings()` returns
 * `current: null` forever — on a correctly configured App Store Connect, with the Paid
 * Apps Agreement signed and StoreKit happily vending. The app is then unsellable and the
 * only symptom is "Store unavailable", which is why six builds of client-side fixes did
 * not move it.
 *
 * `getProducts()` asks StoreKit for these identifiers directly and does not consult
 * Offerings at all. Entitlement granting is unaffected — that mapping lives on the
 * product, not on the Offering — so a purchase made this way still unlocks the same
 * entitlement. Offerings stay the preferred path (they are what makes prices editable
 * without a build); this is the floor beneath them.
 */
export const PRODUCT_IDS = {
  founder: 'com.stillmarch.game.founder',
  standing: 'com.stillmarch.game.standing_orders',
} as const

/** StoreKit products fetched by identifier, kept so `buy()` can purchase without a package. */
const storeProducts = new Map<string, unknown>()

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
 *
 * **Evaluated per call, deliberately.** This was `const isNative =
 * Capacitor.isNativePlatform()` at module scope, which freezes the answer at whatever it
 * was the first time this module was imported. `isNativePlatform()` reads the bridge that
 * the WebView injects, so an import that lands before injection latches `false` for the
 * entire session — and every entry point here then returns early, silently, having set
 * nothing at all. The visible result is a paywall reading "Store unavailable" with no
 * error beneath it, forever, regardless of what Apple is serving. A function call costs
 * nothing and cannot latch.
 */
const isNative = () => Capacitor.isNativePlatform()

/**
 * Every native call gets a deadline.
 *
 * The bridge can leave a promise permanently pending — StoreKit's product request has no
 * timeout of its own, and a purchase sheet that never presents never resolves or rejects.
 * `buy()` clears `busy` on success, on a missing package and in its catch, so the only way
 * the paywall can sit on "Working…" forever is a promise that settles in none of them.
 * That happened on TestFlight build 1 and left the button permanently disabled.
 *
 * This is the file whose header promises monetization can never break the game. A dead
 * button breaks it, so the deadline is not defensive padding — it is that promise.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`[iap] ${label} timed out after ${ms}ms`), { timedOut: true })), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

/** Generous: the sheet involves the user typing an Apple ID password. */
const PURCHASE_MS = 180_000
/** Tight: this is a network product lookup with no human in the loop. */
const OFFERINGS_MS = 20_000

/**
 * Cached dynamic import so the RevenueCat bundle never loads in a browser session.
 *
 * ── Why this returns a WRAPPER object and not the plugin itself ──────────────
 * This is the bug that made the store unsellable for six TestFlight builds.
 *
 * `Purchases` is a Capacitor plugin PROXY: its `get` trap turns *any* property access into
 * a native method call. When an `async` function returns a value, the JavaScript runtime
 * checks whether that value is thenable — it reads `.then` — so returning the proxy made
 * the runtime ask the proxy for `then`, the proxy dutifully bridged it to native, and iOS
 * answered `"Purchases.then()" is not implemented on ios`.
 *
 * The result: EVERY `await plugin()` rejected before it did anything. configure(),
 * getOfferings(), getProducts(), purchase, restore — all of them, on device only, because
 * on the web the guard short-circuits first. The paywall could not have worked, and no
 * amount of fixing the code downstream of this line would have made it work.
 *
 * Wrapping in a plain object breaks the thenable check: `{ Purchases }` has no `.then`,
 * and destructuring at the call site hands back the untouched proxy.
 */
async function plugin(): Promise<{ Purchases: typeof import('@revenuecat/purchases-capacitor')['Purchases'] }> {
  const mod = await import('@revenuecat/purchases-capacitor')
  return { Purchases: mod.Purchases }
}

function activeFrom(info: { entitlements: { active: Record<string, unknown> } }): Set<string> {
  return new Set(Object.keys(info?.entitlements?.active ?? {}))
}

/** Call once at boot. Never throws. */
export async function initPurchases(): Promise<void> {
  if (!isNative()) {
    // Not an error — just nothing to configure.
    set({ ready: true })
    return
  }
  // One RevenueCat app, one key per store. The key is selected by platform rather than
  // hardcoded, because the Android build would otherwise configure against the iOS key
  // and every Billing call would fail with an app-mismatch error. On iOS this reads the
  // same key it always has — no behaviour change.
  const platform = Capacitor.getPlatform()
  const apiKey = platform === 'ios'
    ? import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined
    : platform === 'android'
      ? import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined
      : undefined
  const keyName = platform === 'ios' ? 'VITE_REVENUECAT_IOS_KEY' : 'VITE_REVENUECAT_ANDROID_KEY'
  console.info(`[iap] initPurchases: native (${platform}), apiKey`, apiKey ? `present (${apiKey.slice(0, 9)}…)` : 'MISSING')
  if (!apiKey) {
    console.warn(`[iap] ${keyName} is unset — running with no entitlements`)
    set({ ready: true, error: null })
    return
  }
  try {
    const { Purchases } = await plugin()
    await Purchases.configure({ apiKey })
    console.info('[iap] configured')
    const { customerInfo } = await Purchases.getCustomerInfo()
    set({ ready: true, active: activeFrom(customerInfo) })
    void loadOfferings()
  } catch (e) {
    // NOT silent any more, and the error is no longer swallowed into `null`.
    //
    // This catch used to set `error: null` and skip `loadOfferings()` entirely, so a failed
    // `configure()` produced a paywall with no price AND no reason — the exact state the
    // device was in while the diagnostic written to explain it sat one branch away, never
    // reached. A store outage is still not the player's problem, but it is very much the
    // developer's, and the panel is where it belongs.
    const msg = (e as { message?: string })?.message ?? String(e)
    console.error('[iap] configure failed:', msg)
    set({ ready: true, error: `Store setup failed: ${msg}`.slice(0, 200) })
    void loadOfferings()
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
type Pkg = { identifier?: string; product?: Record<string, unknown> & { identifier?: string } }

/**
 * Pull a displayable price out of whatever shape the bridge handed back.
 *
 * `product.priceString` is the documented field, and reading only it produced the bug this
 * exists for: a package matched (so no error was reported) while the price came back
 * undefined (so no price was shown) — a paywall reading "Store unavailable" with nothing
 * beneath it and no way to tell why. The plugin marshals StoreKit objects across a bridge
 * and the casing has moved between versions, so accept the known aliases and keep the raw
 * keys for the diagnostic rather than assuming one shape is the only shape.
 */
function priceOf(pkg: Pkg | undefined): string | null {
  const p = pkg?.product
  if (!p) return null
  for (const k of ['priceString', 'price_string', 'localizedPriceString', 'localizedPrice']) {
    const v = p[k]
    if (typeof v === 'string' && v.length) return v
  }
  const n = p['price']
  return typeof n === 'number' && Number.isFinite(n) ? `$${n.toFixed(2)}` : null
}

/** What the bridge actually gave us, for the on-screen diagnostic. */
function shapeOf(pkg: Pkg | undefined): string {
  if (!pkg) return 'no package'
  const p = pkg.product
  if (!p) return `pkg "${pkg.identifier ?? '?'}" has no product`
  return `pkg "${pkg.identifier ?? '?'}" product keys: ${Object.keys(p).slice(0, 12).join(',')}`
}
function findPackage(pkgs: Pkg[] | undefined, needle: string): Pkg | undefined {
  return pkgs?.find(p =>
    (p.identifier ?? '').toLowerCase().includes(needle) ||
    (p.product?.identifier ?? '').toLowerCase().includes(needle))
}

/**
 * Fetch the price strings for the paywalls. Best-effort, and safe to call repeatedly.
 *
 * This used to run ONCE, from initPurchases() at boot, and nothing ever called it again.
 * A single failed or empty fetch therefore stuck the paywall at "Store unavailable" for the
 * entire session — reopening it could not help, because the panel only subscribes to
 * already-fetched state. That is not a rare edge: a brand-new app's products are not vended
 * by StoreKit at all until the app has been submitted for review, so every launch before
 * submission poisoned the session, and the first launch AFTER Apple started vending still
 * showed nothing until the app was force-quit.
 *
 * The paywall now refetches when it opens. Cheap (a cached StoreKit lookup), and it means a
 * player who opens the shop a minute after a transient failure sees prices rather than a
 * dead panel.
 */
export async function loadOfferings(): Promise<void> {
  if (!isNative()) {
    // Say so rather than returning mute. A silent early exit here is indistinguishable
    // from "Apple is not vending", and the two need completely different fixes.
    set({ error: 'Store unavailable: not running on a native platform (no StoreKit bridge).' })
    return
  }
  const notes: string[] = []
  let founder: Pkg | undefined, standing: Pkg | undefined

  // ── Path 1: Offerings ──────────────────────────────────────────────────────
  try {
    const { Purchases } = await plugin()
    const { current } = await withTimeout(Purchases.getOfferings(), OFFERINGS_MS, 'getOfferings')
    const pkgs = current?.availablePackages as Pkg[] | undefined
    founder = findPackage(pkgs, 'founder')
    standing = findPackage(pkgs, 'standing')
    if (!pkgs) notes.push('no current offering')
    else if (!pkgs.length) notes.push('offering empty')
    else if (!founder && !standing) notes.push(`offering has ${pkgs.length} pkg(s), none matching: ${pkgs.map(p => p.identifier ?? '?').join(',').slice(0, 60)}`)
  } catch (e) {
    notes.push(`getOfferings failed: ${(e as { message?: string })?.message ?? String(e)}`)
    console.warn('[iap] getOfferings failed', e)
  }

  // ── Path 2: ask StoreKit for the product ids directly ──────────────────────
  //
  // Runs whenever Offerings did not yield a usable price — which includes the case where a
  // package matched but its price was unreadable. Offerings are dashboard state and can be
  // wrong; the product identifiers are compiled in and cannot be. See PRODUCT_IDS.
  let fPrice = priceOf(founder), wPrice = priceOf(standing)
  if (!fPrice || !wPrice) {
    try {
      const { Purchases } = await plugin()
      const wanted = [PRODUCT_IDS.founder, PRODUCT_IDS.standing]
      const { products } = await withTimeout(
        Purchases.getProducts({ productIdentifiers: wanted }), OFFERINGS_MS, 'getProducts')
      const list = (products ?? []) as unknown as Array<Record<string, unknown> & { identifier?: string }>
      for (const prod of list) {
        if (prod?.identifier) storeProducts.set(prod.identifier, prod)
      }
      if (!fPrice) fPrice = priceOf({ product: storeProducts.get(PRODUCT_IDS.founder) as Pkg['product'] })
      if (!wPrice) wPrice = priceOf({ product: storeProducts.get(PRODUCT_IDS.standing) as Pkg['product'] })
      if (!list.length) {
        // The decisive diagnostic. Offerings can be misconfigured; this call cannot be —
        // an empty result here means StoreKit itself is not vending these identifiers, so
        // the problem is in App Store Connect (agreement, product state, bundle id), not
        // in RevenueCat and not in this app.
        notes.push('StoreKit returned 0 products for the compiled ids — App Store Connect is not vending them')
      }
    } catch (e) {
      notes.push(`getProducts failed: ${(e as { message?: string })?.message ?? String(e)}`)
      console.warn('[iap] getProducts failed', e)
    }
  }

  set({
    founderPrice: fPrice,
    standingOrdersPrice: wPrice,
    // Say WHY there is no price, and say it from BOTH paths. "Store unavailable" is true,
    // unactionable, and identical for every possible cause; the notes distinguish a
    // RevenueCat dashboard problem from an App Store Connect one, which need opposite fixes.
    error: (fPrice && wPrice) ? null
      : `Store: ${notes.join(' · ') || 'no price returned'}`.slice(0, 220),
  })
}

/**
 * Buy one SKU. Resolves true if `entitlement` is active afterwards.
 * A user cancellation is NOT an error and must not show one.
 */
async function buy(needle: string, entitlement: string): Promise<boolean> {
  if (!isNative()) {
    set({ error: 'In-app purchases are only available in the app.' })
    return false
  }
  set({ busy: true, error: null })
  try {
    const { Purchases } = await plugin()
    const { current } = await withTimeout(Purchases.getOfferings(), OFFERINGS_MS, 'getOfferings')
    const pkg = findPackage(current?.availablePackages as Pkg[] | undefined, needle)

    // Prefer the package; fall back to the store product loadOfferings() cached by id.
    // Without this fallback the button is dead whenever the RevenueCat Offering is
    // misconfigured — even though a price is on screen, fetched by the other path.
    // `purchaseStoreProduct` grants the same entitlement: that mapping lives on the
    // product in RevenueCat, not on the Offering.
    const productId = needle === 'founder' ? PRODUCT_IDS.founder : PRODUCT_IDS.standing
    let direct = storeProducts.get(productId)
    if (!pkg && !direct) {
      // The price may have come from a fetch in an earlier session state; re-ask once
      // rather than telling the player to come back later.
      await loadOfferings()
      direct = storeProducts.get(productId)
    }
    if (!pkg && !direct) {
      set({ busy: false, error: state.error ?? 'Store unavailable. Try again shortly.' })
      return false
    }
    const { customerInfo } = pkg
      ? await withTimeout(Purchases.purchasePackage({ aPackage: pkg as never }), PURCHASE_MS, 'purchasePackage')
      : await withTimeout(Purchases.purchaseStoreProduct({ product: direct as never }), PURCHASE_MS, 'purchaseStoreProduct')
    const active = activeFrom(customerInfo)
    set({ busy: false, active })
    return active.has(entitlement)
  } catch (e) {
    const cancelled = !!(e as { code?: string; userCancelled?: boolean })?.userCancelled
      || (e as { code?: string })?.code === '1'
    // A timeout is NOT proof the purchase failed — StoreKit may have completed it while the
    // bridge went quiet. Never tell the player it failed without asking who they are first;
    // charging someone and then showing "could not be completed" is the worst outcome here.
    if ((e as { timedOut?: boolean })?.timedOut) {
      console.error('[iap] purchase timed out — re-reading entitlements', e)
      const recovered = await refreshEntitlements()
      set({ busy: false, error: recovered.has(entitlement) ? null : 'Still working. Check back in a moment, or use Restore Purchases.' })
      return recovered.has(entitlement)
    }
    set({ busy: false, error: cancelled ? null : 'Purchase could not be completed.' })
    if (!cancelled) console.error('[iap] purchase failed', e)
    return false
  }
}

/**
 * Ask RevenueCat who this customer is, right now. Used to recover from a timed-out
 * purchase, where the transaction may well have gone through.
 */
async function refreshEntitlements(): Promise<ReadonlySet<string>> {
  try {
    const { Purchases } = await plugin()
    const { customerInfo } = await withTimeout(Purchases.getCustomerInfo(), OFFERINGS_MS, 'getCustomerInfo')
    const active = activeFrom(customerInfo)
    set({ active })
    return active
  } catch (e) {
    console.warn('[iap] refreshEntitlements failed', e)
    return state.active
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
  if (!isNative()) {
    set({ error: 'Restore is only available in the app.' })
    return false
  }
  set({ busy: true, error: null })
  try {
    const { Purchases } = await plugin()
    const { customerInfo } = await withTimeout(Purchases.restorePurchases(), OFFERINGS_MS, 'restorePurchases')
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
