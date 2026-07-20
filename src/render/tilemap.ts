// 2:1 dimetric tilemap. The ground is baked ONCE per (map, tileset, palette) to an
// offscreen canvas and blitted/scrolled per frame; only entities are per-frame work
// (graphics-spec §3, §4.1 "Static map buffer + scroll"). Elevation is baked in too:
// raised tiles draw south-face "skirts" so the flat torus reads with FFTA-style depth,
// and feetY is height-aware so entities/camera sit on the hills.

import { bakedSheet } from './palette'
import type { GroundAnim, IndexedSprite, Palette, TileAnimCycle, TileMapData } from './types'

export const TILE_W = 32
export const TILE_H = 16
export const HALF_W = TILE_W / 2
export const HALF_H = TILE_H / 2
/** Pixels of vertical raise per elevation level. ~half a tile → a 2-level cliff is a
 *  readable ~9px face without overscaling the 32×16 diamond. */
export const ELEV_PX = 8

/** Tile-space → buffer-space (px). Tile (0,0)'s diamond top sits at (originX, 0). */
export function tileToScreenX(tx: number, ty: number): number {
  return (tx - ty) * HALF_W
}

export function tileToScreenY(tx: number, ty: number): number {
  return (tx + ty) * HALF_H
}

export interface GroundBuffer {
  canvas: HTMLCanvasElement
  /** Buffer x of tile (0,0)'s frame left edge; add to tileToScreenX for buffer coords. */
  originX: number
  /** Y offset of the ground plane inside the buffer (tall-tile headroom). */
  planeOffsetY: number
  width: number
  height: number
  /** Per-buffer-tile elevation (row-major, w×h), or null for a flat map. */
  heights: Uint8Array | null
  /** Buffer tile width (for indexing `heights`). */
  bw: number
  // ── Animated ground cells (Phase B) ──────────────────────────────────────────
  // Empty when the map has no animated tiles; otherwise Scene.render reblits each
  // cell's current frame over the static blit. The sheet + frame layout are stashed
  // here so the reblit needs nothing beyond the GroundBuffer and the camera.
  /** Paletted tileset sheet the anim cells reblit from (null iff `anims` is empty). */
  sheet: HTMLCanvasElement | null
  sheetCols: number
  sheetFrameW: number
  sheetFrameH: number
  /** Precomputed animated cells (buffer-space rects + cycle). Empty = none. */
  anims: GroundAnim[]
  /** Shared animation clock (seconds), advanced by Scene.render. */
  elapsed: number
}

/** Bilinear-interpolated elevation at fractional buffer-tile coords (0 if flat). */
export function heightAt(ground: GroundBuffer, tx: number, ty: number): number {
  const h = ground.heights
  if (!h) return 0
  const bw = ground.bw
  const x0 = Math.floor(tx)
  const y0 = Math.floor(ty)
  const fx = tx - x0
  const fy = ty - y0
  const x1 = x0 + 1
  const y1 = y0 + 1
  const at = (x: number, y: number) => h[Math.max(0, Math.min(h.length - 1, y * bw + x))]
  const v00 = at(x0, y0), v10 = at(x1, y0), v01 = at(x0, y1), v11 = at(x1, y1)
  const top = v00 + (v10 - v00) * fx
  const bot = v01 + (v11 - v01) * fx
  return (top + (bot - top) * fy) * ELEV_PX
}

/** Buffer-space center of a tile's diamond — where an entity's feet anchor sits. */
export function feetX(ground: GroundBuffer, tx: number, ty: number): number {
  return ground.originX + tileToScreenX(tx, ty) + HALF_W
}

export function feetY(ground: GroundBuffer, tx: number, ty: number): number {
  return tileToScreenY(tx, ty) + ground.planeOffsetY + HALF_H - heightAt(ground, tx, ty)
}

/** Pack a palette slot (little-endian RGBA Uint32) into a css rgb() string. */
function slotCSS(palette: Palette, slot: number): string {
  const c = palette[slot] >>> 0
  return `rgb(${c & 0xff},${(c >> 8) & 0xff},${(c >> 16) & 0xff})`
}
function darken(css: string, k: number): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(css)!
  return `rgb(${Math.round(+m[1] * k)},${Math.round(+m[2] * k)},${Math.round(+m[3] * k)})`
}

/**
 * Bake a full map's ground to an offscreen buffer. Tileset frames taller than TILE_H
 * (cliffs etc.) are drawn bottom-anchored so their skirt hangs below the diamond.
 * Elevated tiles are raised by h*ELEV_PX with two south-face skirt quads (lit left,
 * shadowed right) so the cliff edge between a raised tile and the lower tile in front
 * reads as real depth — painter's-order (back rows first) makes the front tile's
 * diamond occlude the lower part of the skirt automatically. ~2048×1050px for a 64×64
 * map — baked once, never per frame.
 */
export function bakeGround(
  map: TileMapData,
  tileset: IndexedSprite,
  paletteId: string,
  palette: Palette,
  animCycles?: readonly TileAnimCycle[],
  propSheet?: IndexedSprite,
): GroundBuffer {
  // Frame convention: the bottom TILE_H rows of a frame are the ground diamond; any
  // rows above rise off the plane (rocks, reeds) and correctly overlap the row behind
  // because we paint back-to-front. So a frame's top-left lands at tileToScreenY as-is.
  const width = (map.w + map.h) * HALF_W
  // Extra headroom for the tallest raised tile's lift (MAX_ELEV * ELEV_PX) plus frame.
  let maxH = 0
  if (map.heights) for (let i = 0; i < map.heights.length; i++) if (map.heights[i] > maxH) maxH = map.heights[i]
  const lift = maxH * ELEV_PX
  const height = (map.w + map.h - 2) * HALF_H + tileset.frameH + lift
  const originX = (map.h - 1) * HALF_W

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  const sheet = bakedSheet(tileset, paletteId, palette)
  const { frameW, frameH, cols } = tileset
  const heights = map.heights ?? null

  // Skirt stone colors derived from the palette's stone/accent slots (13–15) so every
  // biome's cliffs match its tileset. Lit face = light stone (14); shadow = mid (13).
  const skirtLit = slotCSS(palette, 14)
  const skirtShadow = darken(slotCSS(palette, 13), 0.72)

  // Animated-cell lookup: frame → the cycle that reblits it (Phase B). A frame belongs
  // to at most one cycle; the first match wins. Built once so the per-cell check is O(1).
  const animByFrame = new Map<number, TileAnimCycle>()
  if (animCycles) for (const c of animCycles) for (const f of c.frames) if (!animByFrame.has(f)) animByFrame.set(f, c)
  const anims: GroundAnim[] = []

  // Flat prop lookup by buffer tile (Phase D). 255 = no prop; else the prop artId.
  // Stamped interleaved in the painter loop below so a front tile's skirt correctly
  // occludes a back tile's prop (props are under units → no depth sort).
  const propArt = new Uint8Array(map.w * map.h).fill(255)
  if (map.props) for (const pr of map.props) {
    if (pr.bx >= 0 && pr.bx < map.w && pr.by >= 0 && pr.by < map.h) propArt[pr.by * map.w + pr.bx] = pr.artId
  }
  const propBaked = propSheet ? bakedSheet(propSheet, paletteId, palette) : null
  const propCols = propSheet?.cols ?? 0
  const propFW = propSheet?.frameW ?? 0
  const propFH = propSheet?.frameH ?? 0

  // Painter's order: back rows first.
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const idx = ty * map.w + tx
      const frame = map.tiles[idx]
      const h = heights ? heights[idx] : 0
      const e = h * ELEV_PX
      const sx = (frame % cols) * frameW
      const sy = ((frame / cols) | 0) * frameH
      const dx = originX + tileToScreenX(tx, ty)
      const dy = tileToScreenY(tx, ty) - e

      // Skirt: two south-face quads from the diamond's lower edges down to the base
      // plane (dy + e + ...). Drawn before the diamond so the top edge seams cleanly.
      if (e > 0) {
        // Diamond lower-edge points (frame-local): left (0,16), bottom (16,23),
        // right (32,16). Projected down by e to the base plane.
        const lx = dx, ly = dy + 16
        const bx = dx + 16, by = dy + 23
        const rx = dx + 32, ry = dy + 16
        const byBase = by + e        // base plane (h=0) bottom point
        const lyBase = ly + e, ryBase = ry + e
        // Left (south-west) face — lit.
        ctx.fillStyle = skirtLit
        ctx.beginPath()
        ctx.moveTo(lx, ly); ctx.lineTo(bx, by); ctx.lineTo(bx, byBase); ctx.lineTo(lx, lyBase)
        ctx.closePath(); ctx.fill()
        // Right (south-east) face — shadowed.
        ctx.fillStyle = skirtShadow
        ctx.beginPath()
        ctx.moveTo(rx, ry); ctx.lineTo(bx, by); ctx.lineTo(bx, byBase); ctx.lineTo(rx, ryBase)
        ctx.closePath(); ctx.fill()
      }

      ctx.drawImage(sheet, sx, sy, frameW, frameH, dx, dy, frameW, frameH)

      // Flat prop on this tile (Phase D): stamped at the same dx, dy so it sits on the
      // tile's surface (and raises with it via the height-aware dy). Same painter's
      // order as the terrain — a later (front) tile overdraws this prop where they
      // overlap, which is correct for under-unit clutter.
      const art = propArt[idx]
      if (propBaked && art !== 255) {
        const psx = (art % propCols) * propFW
        const psy = ((art / propCols) | 0) * propFH
        ctx.drawImage(propBaked, psx, psy, propFW, propFH, dx, dy, propFW, propFH)
      }

      // Record the cell for per-frame reblit if its frame is part of an anim cycle.
      // dx/dy match the bake exactly, so the reblit overwrites the same diamond pixels.
      const cyc = animByFrame.get(frame)
      if (cyc) anims.push({ dx, dy, frames: cyc.frames, dur: cyc.dur })
    }
  }

  return {
    canvas, originX, planeOffsetY: tileset.frameH - TILE_H, width, height, heights, bw: map.w,
    sheet: anims.length ? sheet : null,
    sheetCols: cols, sheetFrameW: frameW, sheetFrameH: frameH,
    anims, elapsed: 0,
  }
}