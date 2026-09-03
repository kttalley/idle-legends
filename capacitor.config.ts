import type { CapacitorConfig } from '@capacitor/cli'

// NOTE: `appId` must match the bundle identifier registered in App Store Connect. Change
// it there and here together, before the first upload — it cannot be changed afterwards
// for a given app record.
const config: CapacitorConfig = {
  appId: 'com.stillmarch.game',
  appName: 'Stillmarch',
  // Vite's build output. Populate it with `npm run build:native`, NOT `npm run build`:
  // the web target hardcodes the /projects/stillmarch/ base, and iOS serves this
  // bundle from capacitor://localhost at the ROOT, so every asset would 404.
  webDir: 'dist',
  ios: {
    // The world canvas is full-bleed and the HUD handles its own safe-area insets via
    // env(safe-area-inset-*), so the WebView must not also inset the content.
    contentInset: 'never',
    // Matches the app's darkest background, so an over-scroll or a slow first paint
    // shows the game's own black rather than a white flash.
    backgroundColor: '#0b0906',
    // The game reads as a dark app; the status bar text must stay light.
    preferredContentMode: 'mobile',
  },
  server: {
    // iOS default. Declared explicitly because the app's asset paths are relative and
    // depend on being served from the root of this scheme.
    iosScheme: 'capacitor',
  },
  android: {
    // Set for the store build on 2026-08-28. While this was true, chrome://inspect#devices
    // attached to the release WebView and console output was observable — that debugging
    // aid cost nothing on iOS but is not appropriate for a Play release build.
    // It also enables CapacitorConsole logcat forwarding.
    webContentsDebuggingEnabled: false,
    // Same rationale as the iOS backgroundColor: over-scroll or a slow first paint must
    // show the game's own black, never a white flash. Android also uses this for the
    // WebView's background behind transparent page regions.
    backgroundColor: '#0b0906',
    // Left at the default `https` scheme (Capacitor 6+): the relative asset base resolves
    // identically under https://localhost as under capacitor://localhost. Declared here
    // only to document that no override is deliberate.
  },
}

export default config
