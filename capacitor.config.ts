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
}

export default config
