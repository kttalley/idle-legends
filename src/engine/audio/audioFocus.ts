// ── Audio focus, as seen from the web layer ─────────────────────────────────
//
// A thin typed wrapper over the native plugin in
// `android/app/src/main/java/com/stillmarch/game/AudioFocusPlugin.java`. Android-only by
// design: iOS owns its audio behaviour through WKWebView + AVAudioSession and must not
// gain a second resume path, and a browser tab should keep playing while hidden (that is
// the point of an idle game). Everything fails soft — a focus problem must never take
// down the audio latch.

import { Capacitor, registerPlugin } from '@capacitor/core'

interface AudioFocusPlugin {
  request(): Promise<{ granted: boolean }>
  abandon(): Promise<void>
}

const AudioFocus = registerPlugin<AudioFocusPlugin>('AudioFocus')

/**
 * Evaluated per call, never latched — same trap as `keychain.ts`: an import that lands
 * before bridge injection would freeze `isNativePlatform()` at false.
 */
const isAndroidNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/**
 * Take AUDIOFOCUS_GAIN for the continuous game audio. Fire-and-forget: the plugin proxy
 * is never awaited on the latch path (the iOS `.then`-probe lesson), and a refusal just
 * means today's behaviour — mixing unfocused — until the next visibility change retries.
 */
export async function requestAudioFocus(): Promise<boolean> {
  if (!isAndroidNative()) return false
  try {
    const { granted } = await AudioFocus.request()
    return granted
  } catch (e) {
    console.warn('[audio] focus request failed', e)
    return false
  }
}

/** Release focus — API symmetry with the native plugin for the audio-stops paths. */
export async function abandonAudioFocus(): Promise<void> {
  if (!isAndroidNative()) return
  try {
    await AudioFocus.abandon()
  } catch (e) {
    console.warn('[audio] focus abandon failed', e)
  }
}