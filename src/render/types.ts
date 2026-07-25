// Core data contracts for the dimetric renderer. Architecture: docs/graphics-spec.md §4–5.
// This module (and everything under src/render/ except dev/) must stay free of React and
// game-code imports; the game talks to the renderer through src/render/adapter/ only.

export type CoreAnim = 'idle' | 'walk' | 'attack' | 'hit'
// 'death' is optional — sprites that don't author it (e.g. the FFTA scaffold, whose
// import only pulls idle/walk/attack) fall back to a recoil-collapse in the Animator.
export type AnimName = CoreAnim | 'death'

// Four logical facings; only 'se' and 'ne' are drawn, 'sw'/'nw' are horizontal mirrors.
export type Facing = 'se' | 'sw' | 'ne' | 'nw'
export type DrawnFacing = 'se' | 'ne'

export interface AnimDef {
  frames: number[] // frame indices into the sheet grid
  fps: number
  loop: boolean
}

export type AnimationSet =
  Record<CoreAnim, Record<DrawnFacing, AnimDef>> &
  Partial<Record<'death', Record<DrawnFacing, AnimDef>>>

// The authored format: an indexed-color PNG sheet + this manifest (JSON).
// Hand-drawn art, gen-AI imports, and the FFTA scaffold all arrive in exactly this shape
// via tools/importSprite.mjs; placeholderArt.ts synthesizes the runtime form directly.
export interface SpriteManifest {
  id: string
  image: string // sheet PNG path, relative to the manifest file
  frameW: number
  frameH: number
  // Feet-center anchor in frame pixels. Depth sort keys off this point and mirroring
  // reflects about its vertical axis — see graphics-spec §1.4.
  anchor: { x: number; y: number }
  // Slot → source color. Loader decomposes the sheet back to slot indices with this.
  // [0] must be the transparent color (or "" for alpha-0 transparency).
  sourcePalette: string[]
  animations: AnimationSet
}

// Runtime form: pixels are palette slots, not colors (graphics-spec §7.1).
export interface IndexedSprite {
  id: string
  frameW: number
  frameH: number
  cols: number // frames per sheet row
  frameCount: number
  indices: Uint8Array // frameCount * frameW * frameH, one slot per pixel, frame-major
  anchor: { x: number; y: number }
  animations: AnimationSet
}

// 16 packed little-endian RGBA colors (ImageData byte order). Slot 0 is always 0 (transparent).
export type Palette = Uint32Array

export interface TileMapData {
  w: number
  h: number
  tiles: Uint8Array // frame index into the tileset sprite, row-major
  /** Per-tile elevation (0..MAX_ELEV), same shape as `tiles`. Optional → flat. */
  heights?: Uint8Array
  /** Flat ground-clutter props in BUFFER-tile coords (Phase D), built by the adapter
   *  from ZoneMap.props (game coords) so they wrap with the padded border. Stamped
   *  interleaved in bakeGround's painter loop. Optional → no clutter. */
  props?: { bx: number; by: number; artId: number }[]
  /** Tile period of the world's wrap (the zone torus edge). Set → the ground repeats
   *  every `wrapTiles` on both axes, so the renderer can tile it to fill the viewport
   *  instead of running out of baked pixels. Omit for finite maps (the town). */
  wrapTiles?: number
}

/**
 * A tile animation cycle (environment-plan Phase B). A cell whose baked frame is in
 * `frames` reblits through that list every `dur` seconds — the FFTA VRAM-slot-swap
 * behavior re-implemented as per-cell drawImage over the static ground blit. Cell-based
 * (not slot-based) because our bake is per-cell. Defined where the tileset is authored
 * (placeholderArt `TILE_ANIMS`) and handed to `bakeGround`.
 */
export interface TileAnimCycle {
  frames: number[]
  dur: number
}

/**
 * A resolved animated ground cell on a baked `GroundBuffer`: the buffer-space rect to
 * reblit, the frame cycle, and the frame duration. Precomputed at bake time so the
 * per-frame reblit is a single `drawImage` with no projection math.
 */
export interface GroundAnim {
  /** Buffer-space left edge of the cell's frame. */
  dx: number
  /** Buffer-space top edge of the cell's frame (height-aware, same as the bake). */
  dy: number
  frames: number[]
  dur: number
}
