// 2:1 dimetric tilemap. The ground is baked ONCE per (map, tileset, palette) to an
// offscreen canvas and blitted/scrolled per frame; only entities are per-frame work
// (graphics-spec §3, §4.1 "Static map buffer + scroll").

import { bakedSheet } from './palette'
import type { IndexedSprite, Palette, TileMapData } from './types'

export const TILE_W = 32
export const TILE_H = 16
export const HALF_W = TILE_W / 2
export const HALF_H = TILE_H / 2

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
}

/** Buffer-space center of a tile's diamond — where an entity's feet anchor sits. */
export function feetX(ground: GroundBuffer, tx: number, ty: number): number {
  return ground.originX + tileToScreenX(tx, ty) + HALF_W
}

export function feetY(ground: GroundBuffer, tx: number, ty: number): number {
  return tileToScreenY(tx, ty) + ground.planeOffsetY + HALF_H
}

/**
 * Bake a full map's ground to an offscreen buffer. Tileset frames taller than TILE_H
 * (cliffs etc.) are drawn bottom-anchored so their skirt hangs below the diamond.
 * ~2048×1050px for a 64×64 map — baked once, never per frame.
 */
export function bakeGround(
  map: TileMapData,
  tileset: IndexedSprite,
  paletteId: string,
  palette: Palette,
): GroundBuffer {
  // Frame convention: the bottom TILE_H rows of a frame are the ground diamond; any
  // rows above rise off the plane (rocks, reeds) and correctly overlap the row behind
  // because we paint back-to-front. So a frame's top-left lands at tileToScreenY as-is.
  const width = (map.w + map.h) * HALF_W
  const height = (map.w + map.h - 2) * HALF_H + tileset.frameH
  const originX = (map.h - 1) * HALF_W

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  const sheet = bakedSheet(tileset, paletteId, palette)
  const { frameW, frameH, cols } = tileset

  // Painter's order: back rows first.
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const frame = map.tiles[ty * map.w + tx]
      const sx = (frame % cols) * frameW
      const sy = ((frame / cols) | 0) * frameH
      const dx = originX + tileToScreenX(tx, ty)
      const dy = tileToScreenY(tx, ty)
      ctx.drawImage(sheet, sx, sy, frameW, frameH, dx, dy, frameW, frameH)
    }
  }

  return { canvas, originX, planeOffsetY: tileset.frameH - TILE_H, width, height }
}
