import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web deploy lives under a subpath; a Capacitor build does not. iOS serves the
// bundle from `capacitor://localhost/` (Android from `https://localhost/`), both at the
// ROOT — so the absolute web base would 404 every sprite, manifest and chunk inside the
// WebView. Every runtime asset path in src/ goes through `import.meta.env.BASE_URL`
// (combatAdapter, spriteCache, harness), so flipping this one value is sufficient.
//   npm run build          → web, /projects/idle-legends/
//   npm run build:native   → Capacitor, relative
const native = process.env.BUILD_TARGET === 'native'

export default defineConfig({
  plugins: [react()],
  base: native ? './' : '/projects/idle-legends/',
})
