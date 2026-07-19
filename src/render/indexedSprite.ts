// Indexed sprite loader: authored PNG sheet + JSON manifest → runtime IndexedSprite.
// The sheet is decomposed back to palette-slot indices at load time by matching pixels
// against the manifest's sourcePalette (nearest-color for antialiased strays), so the
// renderer downstream only ever handles slots — never source colors.

import { registerPalette } from './palettes'
import type { IndexedSprite, SpriteManifest } from './types'

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image load failed: ${url}`))
    img.src = url
  })
}

/** Decompose a decoded RGBA sheet into slot indices using the manifest's palette. */
export function decompose(manifest: SpriteManifest, img: HTMLImageElement | HTMLCanvasElement): IndexedSprite {
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const rgba = ctx.getImageData(0, 0, w, h).data

  const cols = Math.floor(w / manifest.frameW)
  const rows = Math.floor(h / manifest.frameH)
  const frameCount = cols * rows
  const fw = manifest.frameW
  const fh = manifest.frameH

  // Slot lookup: exact match by packed color, nearest-distance fallback.
  const exact = new Map<number, number>()
  const palRgb: [number, number, number][] = []
  for (let slot = 0; slot < manifest.sourcePalette.length; slot++) {
    const hex = manifest.sourcePalette[slot]
    if (!hex) {
      palRgb.push([-1000, -1000, -1000]) // never nearest-matched
      continue
    }
    const [r, g, b] = hexToRgb(hex)
    exact.set((r << 16) | (g << 8) | b, slot)
    palRgb.push([r, g, b])
  }

  const indices = new Uint8Array(frameCount * fw * fh)
  for (let f = 0; f < frameCount; f++) {
    const gx = (f % cols) * fw
    const gy = ((f / cols) | 0) * fh
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const si = ((gy + y) * w + (gx + x)) * 4
        const a = rgba[si + 3]
        if (a < 128) continue // transparent → slot 0
        const r = rgba[si]
        const g = rgba[si + 1]
        const b = rgba[si + 2]
        let slot = exact.get((r << 16) | (g << 8) | b)
        if (slot === undefined) {
          let best = 1
          let bestD = Infinity
          for (let s = 1; s < palRgb.length; s++) {
            const [pr, pg, pb] = palRgb[s]
            const d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb)
            if (d < bestD) {
              bestD = d
              best = s
            }
          }
          slot = best
        }
        indices[f * fw * fh + y * fw + x] = slot
      }
    }
  }

  return {
    id: manifest.id,
    frameW: fw,
    frameH: fh,
    cols,
    frameCount,
    indices,
    anchor: manifest.anchor,
    animations: manifest.animations,
  }
}

/** Load manifest + sheet from a URL. Returns null on any failure (404, bad image…). */
export async function loadSprite(manifestUrl: string): Promise<IndexedSprite | null> {
  try {
    const res = await fetch(manifestUrl)
    if (!res.ok) return null
    const manifest = (await res.json()) as SpriteManifest
    const imgUrl = new URL(manifest.image, new URL(manifestUrl, location.href)).href
    const img = await loadImage(imgUrl)
    // The sheet's own colors become palette id `src/<id>` — render byte-true by default,
    // or pass any registry palette id to recolor the same rig.
    registerPalette(`src/${manifest.id}`, manifest.sourcePalette)
    return decompose(manifest, img)
  } catch {
    return null
  }
}

/**
 * Scaffold-aware loader: try the (gitignored, dev-only) local-assets path first and
 * fall back to a generated placeholder. Deleting local-assets/ reverts the whole game
 * to programmatic art with no code change — the tear-out guarantee.
 */
export async function loadSpriteOrPlaceholder(
  scaffoldManifestUrl: string,
  makePlaceholder: () => IndexedSprite,
): Promise<IndexedSprite> {
  const scaffold = await loadSprite(scaffoldManifestUrl)
  if (scaffold) return scaffold
  return makePlaceholder()
}
