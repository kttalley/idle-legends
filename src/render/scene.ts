// Scene: pooled entities, painter's-order depth sort by feet screen-Y, and a
// zero-allocation render pass (graphics-spec §3.3, §4.1). The hot path performs no
// object/array/closure allocation — entities are pooled, the sort is an in-place
// insertion sort over a pre-grown index array (near-sorted between frames ⇒ ~O(n)).

import { Animator } from './animation'
import { bakedSheet } from './palette'
import { getPalette } from './palettes'
import { feetX, feetY, type GroundBuffer } from './tilemap'
import type { IndexedSprite } from './types'

export interface Camera {
  /** Top-left of the viewport in ground-buffer coordinates. */
  x: number
  y: number
  w: number
  h: number
}

export interface Entity {
  active: boolean
  /** Fractional tile-space position; feet anchor derives from this. */
  tx: number
  ty: number
  sprite: IndexedSprite
  paletteId: string
  animator: Animator
  /** Draw a soft shadow ellipse under the feet. */
  shadow: boolean
  /** Vertical lift in px (jump/hop). Applied to the body draw only — feet stay on
   *  the ground, so depth sort and shadow are unchanged while airborne. */
  z: number
  /** Body + shadow opacity (death fade-out). 1 = opaque. */
  alpha: number
  // Computed each frame (buffer space):
  screenX: number
  screenY: number
  /** Set each render: is the sprite's bounding box within the viewport (+margin)?
   *  Off-screen entities are still projected + sorted (cheap) but skip the expensive
   *  shadow fill / palette lookup / drawImage. With 100+ entities per zone this is the
   *  bulk of the frame cost. */
  onScreen: boolean
}

export class Scene {
  readonly entities: Entity[] = []
  private order: number[] = []

  spawn(sprite: IndexedSprite, paletteId: string, tx: number, ty: number): Entity {
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i]
      if (!e.active) {
        e.active = true
        e.tx = tx
        e.ty = ty
        e.sprite = sprite
        e.paletteId = paletteId
        e.animator = new Animator(sprite)
        e.shadow = true
        e.z = 0
        e.alpha = 1
        e.onScreen = false
        return e
      }
    }
    const e: Entity = {
      active: true,
      tx,
      ty,
      sprite,
      paletteId,
      animator: new Animator(sprite),
      shadow: true,
      z: 0,
      alpha: 1,
      screenX: 0,
      screenY: 0,
      onScreen: false,
    }
    this.entities.push(e)
    this.order.push(this.entities.length - 1)
    return e
  }

  update(dt: number): void {
    const es = this.entities
    for (let i = 0; i < es.length; i++) {
      if (es[i].active) es[i].animator.update(dt)
    }
  }

  /**
   * @param groundDecals Optional painter hook run after the ground (and its animated
   *   cells) but before any shadow or body — i.e. decals that belong ON the terrain and
   *   UNDER every unit, like a target reticle. Drawing these after render() instead
   *   would paint them over the sprites standing on them.
   */
  render(
    ctx: CanvasRenderingContext2D, cam: Camera, ground: GroundBuffer, dt = 0,
    groundDecals?: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    // 1. Ground blit (the entire static map cost per frame is this one drawImage).
    //    Clamp the source rect to the ground buffer: an out-of-bounds drawImage source
    //    throws IndexSizeError on WebKit/iOS (Blink silently clips), which — thrown from
    //    the frame loop — would blank the whole scene until reload. The camera can sit
    //    partly past the (wrapped) buffer edge, and a runtime zoom/resize changes cam.w/h
    //    mid-frame, so guard it. In-bounds pixels map 1:1 exactly as before; the
    //    letterbox stays the cleared void.
    ctx.clearRect(0, 0, cam.w, cam.h)
    let sx = cam.x, sy = cam.y, sw = cam.w, sh = cam.h
    let dx = 0, dy = 0
    if (sx < 0) { dx = -sx; sw += sx; sx = 0 }
    if (sy < 0) { dy = -sy; sh += sy; sy = 0 }
    if (sx + sw > ground.width) sw = ground.width - sx
    if (sy + sh > ground.height) sh = ground.height - sy
    if (sw > 0 && sh > 0) ctx.drawImage(ground.canvas, sx, sy, sw, sh, dx, dy, sw, sh)

    // 1b. Animated ground cells (Phase B): reblit just the water (etc.) cells' current
    // frames over the static blit. One shared clock advances all cells in sync (the
    // FFTA slot-swap reads the same way); off-screen cells are culled. The count is
    // small and bounded by the viewport, so this stays well clear of a perf cliff.
    const anims = ground.anims
    if (anims.length && ground.sheet) {
      ground.elapsed += dt
      const sheet = ground.sheet
      const fw = ground.sheetFrameW, fh = ground.sheetFrameH, cols = ground.sheetCols
      const t = ground.elapsed
      const camR = cam.x + cam.w, camB = cam.y + cam.h
      for (let i = 0; i < anims.length; i++) {
        const a = anims[i]
        // Cull off-screen cells (buffer-space rect vs camera).
        if (a.dx + fw < cam.x || a.dx > camR || a.dy + fh < cam.y || a.dy > camB) continue
        const f = a.frames[Math.floor(t / a.dur) % a.frames.length]
        const sx = (f % cols) * fw
        const sy = ((f / cols) | 0) * fh
        ctx.drawImage(sheet, sx, sy, fw, fh, Math.round(a.dx - cam.x), Math.round(a.dy - cam.y), fw, fh)
      }
    }

    // 1c. Ground decals — on the terrain, under every unit.
    if (groundDecals) groundDecals(ctx)

    const es = this.entities
    const order = this.order

    // 2. Project feet anchors into buffer space + viewport-cull test. The sprite box is
    //    ~[screenX ± frameW/2] × [screenY − frameH − z, screenY + shadow]; onScreen is
    //    the overlap of that box with the camera rect (+small margin). Off-screen
    //    entities skip the shadow/body draws below (steps 4–5).
    const camR = cam.x + cam.w, camB = cam.y + cam.h
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (!e.active) continue
      e.screenX = feetX(ground, e.tx, e.ty)
      e.screenY = feetY(ground, e.tx, e.ty)
      const halfW = e.sprite.frameW * 0.5 + 4
      const top = e.sprite.frameH + e.z + 4
      e.onScreen =
        e.screenX + halfW > cam.x && e.screenX - halfW < camR &&
        e.screenY + 6 > cam.y && e.screenY - top < camB
    }

    // 3. Painter's sort by feet Y — in-place insertion sort on the index array.
    for (let i = 1; i < order.length; i++) {
      const idx = order[i]
      const key = es[idx].screenY
      let j = i - 1
      while (j >= 0 && es[order[j]].screenY > key) {
        order[j + 1] = order[j]
        j--
      }
      order[j + 1] = idx
    }

    // 4. Shadows first (under all bodies), then bodies back-to-front. An airborne
    // entity (z>0) keeps its shadow on the ground but smaller + fainter with height.
    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    for (let i = 0; i < order.length; i++) {
      const e = es[order[i]]
      if (!e.active || !e.shadow || !e.onScreen) continue
      const dx = e.screenX - cam.x
      const dy = e.screenY - cam.y
      const shr = e.z > 0 ? Math.max(0.5, 1 - e.z / 40) : 1
      const ga = (e.z > 0 ? 0.3 * shr : 1) * e.alpha
      if (ga !== 1) ctx.globalAlpha = ga
      ctx.beginPath()
      ctx.ellipse(dx, dy, e.sprite.frameW * 0.28 * shr, 3.5 * shr, 0, 0, Math.PI * 2)
      ctx.fill()
      if (ga !== 1) ctx.globalAlpha = 1
    }

    for (let i = 0; i < order.length; i++) {
      const e = es[order[i]]
      if (!e.active || !e.onScreen) continue
      const s = e.sprite
      const sheet = bakedSheet(s, e.paletteId, getPalette(e.paletteId))
      const f = e.animator.frame
      const sx = (f % s.cols) * s.frameW
      const sy = ((f / s.cols) | 0) * s.frameH
      const dx = Math.round(e.screenX - cam.x)
      const dy = Math.round(e.screenY - cam.y - e.z)
      if (e.alpha < 1) ctx.globalAlpha = e.alpha
      if (e.animator.mirror) {
        // Mirror about the feet-center anchor's vertical axis.
        // Local space is x-mirrored: source column c lands at screen dx + anchor.x - c,
        // so the anchor column stays fixed at dx and the art reflects about the feet.
        ctx.setTransform(-1, 0, 0, 1, dx, dy)
        ctx.drawImage(sheet, sx, sy, s.frameW, s.frameH, -s.anchor.x, -s.anchor.y, s.frameW, s.frameH)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      } else {
        ctx.drawImage(sheet, sx, sy, s.frameW, s.frameH, dx - s.anchor.x, dy - s.anchor.y, s.frameW, s.frameH)
      }
      if (e.alpha < 1) ctx.globalAlpha = 1
    }
  }
}
