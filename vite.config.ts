import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// The web deploy lives under a subpath; a Capacitor build does not. iOS serves the
// bundle from `capacitor://localhost/` (Android from `https://localhost/`), both at the
// ROOT — so the absolute web base would 404 every sprite, manifest and chunk inside the
// WebView. Every runtime asset path in src/ goes through `import.meta.env.BASE_URL`
// (combatAdapter, spriteCache, harness), so flipping this one value is sufficient.
//   npm run build          → web, /projects/stillmarch/
//   npm run build:native   → Capacitor, relative
const native = process.env.BUILD_TARGET === 'native'

// ── The LLM endpoint never ships ─────────────────────────────────────────────
//
// Vite inlines every `VITE_*` var it finds — including from `.env.local`, in production
// builds, which is not obvious. So keeping `VITE_LLM_URL` in `.env.local` "for local dev
// only" did not do what its comment claimed: on 2026-08-15 the personal Ollama endpoint
// was found baked into both `dist/assets/*.js` and `ios/App/App/public/assets/*.js`,
// publishing an unauthenticated, unmetered box to every player of either build.
//
// `npm run dev` still reads the var normally — this strips it at BUILD time only, which
// is exactly the policy `.env.example` already stated but nothing enforced.
//
// When the hosted proxy lands (Track N's Cloudflare Worker, which holds the inference key
// and verifies the Supabase JWT), a public endpoint becomes deliberate rather than
// accidental: build with ALLOW_PUBLIC_LLM=1 and set VITE_LLM_URL to the proxy.
const stripLlm = process.env.ALLOW_PUBLIC_LLM !== '1'

// ── The version the funnel reports ───────────────────────────────────────────
// Read from the native projects rather than package.json (which still says 1.0.0 and
// nothing bumps): the version a player is on is the one the stores shipped. Android's
// versionName and iOS's MARKETING_VERSION are bumped together on every release; if they
// ever disagree, say so loudly rather than report one of them as the truth.
function nativeVersion(): string {
  const read = (path: string, re: RegExp) => {
    try { return readFileSync(new URL(path, import.meta.url), 'utf8').match(re)?.[1] ?? null } catch { return null }
  }
  const android = read('./android/app/build.gradle', /versionName "([^"]+)"/)
  const ios = read('./ios/App/App.xcodeproj/project.pbxproj', /MARKETING_VERSION = ([^;]+);/)
  if (android && ios && android !== ios) {
    console.warn(`[version] Android versionName ${android} ≠ iOS MARKETING_VERSION ${ios}; reporting Android's`)
  }
  return android ?? ios ?? 'unknown'
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: native ? './' : '/projects/stillmarch/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(nativeVersion()),
    ...(command === 'build' && stripLlm ? { 'import.meta.env.VITE_LLM_URL': 'undefined' } : {}),
  },
}))
