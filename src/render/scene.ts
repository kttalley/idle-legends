// Scene: pooled entities, painter's-order depth sort by feet screen-Y, and a
// zero-allocation render pass (graphics-spec §3.3, §4.1). The hot path performs no
// object/array/closure allocation — entities are pooled, the sort is an in-place
// insertion sort over a pre-grown index array (near-sorted between frames ⇒ ~O(n)).

import { Animator } from './animation'
import { isMirrored } from './animation'
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
  // Computed each frame (buffer space):
  screenX: number
  screenY: number
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
      screenX: 0,
      screenY: 0,
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

  render(ctx: CanvasRenderingContext2D, cam: Camera, ground: GroundBuffer): void {
    // 1. Ground blit (the entire static map cost per frame is this one drawImage).
    ctx.clearRect(0, 0, cam.w, cam.h)
    ctx.drawImage(ground.canvas, cam.x, cam.y, cam.w, cam.h, 0, 0, cam.w, cam.h)

    const es = this.entities
    const order = this.order

    // 2. Project feet anchors into buffer space.
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (!e.active) continue
      e.screenX = feetX(ground, e.tx, e.ty)
      e.screenY = feetY(ground, e.tx, e.ty)
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

    // 4. Shadows first (under all bodies), then bodies back-to-front.
    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    for (let i = 0; i < order.length; i++) {
      const e = es[order[i]]
      if (!e.active || !e.shadow) continue
      const dx = e.screenX - cam.x
      const dy = e.screenY - cam.y
      ctx.beginPath()
      ctx.ellipse(dx, dy, e.sprite.frameW * 0.28, 3.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    for (let i = 0; i < order.length; i++) {
      const e = es[order[i]]
      if (!e.active) continue
      const s = e.sprite
      const sheet = bakedSheet(s, e.paletteId, getPalette(e.paletteId))
      const f = e.animator.frame
      const sx = (f % s.cols) * s.frameW
      const sy = ((f / s.cols) | 0) * s.frameH
      const dx = Math.round(e.screenX - cam.x)
      const dy = Math.round(e.screenY - cam.y)
      if (isMirrored(e.animator.facing)) {
        // Mirror about the feet-center anchor's vertical axis.
        // Local space is x-mirrored: source column c lands at screen dx + anchor.x - c,
        // so the anchor column stays fixed at dx and the art reflects about the feet.
        ctx.setTransform(-1, 0, 0, 1, dx, dy)
        ctx.drawImage(sheet, sx, sy, s.frameW, s.frameH, -s.anchor.x, -s.anchor.y, s.frameW, s.frameH)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      } else {
        ctx.drawImage(sheet, sx, sy, s.frameW, s.frameH, dx - s.anchor.x, dy - s.anchor.y, s.frameW, s.frameH)
      }
    }
  }
}
