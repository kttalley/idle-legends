// ── The Keychain, as seen from the web layer ──────────────────────────────────
//
// A thin typed wrapper over the native plugin in `ios/App/App/KeychainPlugin.swift`.
// Everything resolves; nothing here throws. On the web build, and on any platform without
// the plugin, every call is a no-op returning null — which degrades to exactly the
// behaviour that existed before this file, i.e. a session that lives only in localStorage.

import { Capacitor, registerPlugin } from '@capacitor/core'

interface KeychainPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

const Keychain = registerPlugin<KeychainPlugin>('Keychain')

/**
 * Evaluated per call, never latched.
 *
 * The same trap `purchases.ts` documents at length: `isNativePlatform()` reads a bridge
 * the WebView injects, so an import that lands before injection would freeze this at
 * `false` for the whole session and silently disable the Keychain entirely.
 */
const isNative = () => Capacitor.isNativePlatform()

export async function keychainGet(key: string): Promise<string | null> {
  if (!isNative()) return null
  try {
    const { value } = await Keychain.get({ key })
    return value ?? null
  } catch (e) {
    console.warn('[keychain] read failed', e)
    return null
  }
}

export async function keychainSet(key: string, value: string): Promise<void> {
  if (!isNative()) return
  try {
    await Keychain.set({ key, value })
  } catch (e) {
    // Non-fatal by design. A failed write costs durability across a reinstall — bad, but
    // strictly better than failing whatever operation prompted the write.
    console.warn('[keychain] write failed', e)
  }
}

export async function keychainRemove(key: string): Promise<void> {
  if (!isNative()) return
  try {
    await Keychain.remove({ key })
  } catch (e) {
    console.warn('[keychain] delete failed', e)
  }
}
