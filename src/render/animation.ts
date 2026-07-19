// Frame-tag animation with two drawn facings mirrored to four (graphics-spec §1.3, §4.2).
// Animator instances are long-lived and allocation-free in update().

import type { AnimName, DrawnFacing, Facing, IndexedSprite } from './types'

export function drawnFacing(f: Facing): DrawnFacing {
  return f === 'se' || f === 'sw' ? 'se' : 'ne'
}

export function isMirrored(f: Facing): boolean {
  return f === 'sw' || f === 'nw'
}

export class Animator {
  sprite: IndexedSprite
  anim: AnimName = 'idle'
  facing: Facing = 'se'
  /** Current sheet frame index — read by the scene when drawing. */
  frame = 0
  /** True once a non-looping animation has played out (caller decides what's next). */
  finished = false

  private cursor = 0
  private elapsed = 0

  constructor(sprite: IndexedSprite) {
    this.sprite = sprite
    this.frame = this.def().frames[0]
  }

  private def() {
    return this.sprite.animations[this.anim][drawnFacing(this.facing)]
  }

  /** Switch animation; restarts only when the tag actually changes. */
  set(anim: AnimName): void {
    if (anim === this.anim) return
    this.anim = anim
    this.cursor = 0
    this.elapsed = 0
    this.finished = false
    this.frame = this.def().frames[0]
  }

  /** Force-restart the current animation (e.g. retrigger 'attack'). */
  restart(): void {
    this.cursor = 0
    this.elapsed = 0
    this.finished = false
    this.frame = this.def().frames[0]
  }

  face(facing: Facing): void {
    if (facing === this.facing) return
    const before = drawnFacing(this.facing)
    this.facing = facing
    if (drawnFacing(facing) !== before) {
      // Different drawn sheet row — re-resolve the frame, keep the cursor.
      const def = this.def()
      if (this.cursor >= def.frames.length) this.cursor = def.frames.length - 1
      this.frame = def.frames[this.cursor]
    }
  }

  update(dt: number): void {
    const def = this.def()
    if (def.frames.length <= 1) {
      this.frame = def.frames[0]
      if (!def.loop) this.finished = true
      return
    }
    this.elapsed += dt
    const frameDur = 1 / def.fps
    while (this.elapsed >= frameDur) {
      this.elapsed -= frameDur
      this.cursor++
      if (this.cursor >= def.frames.length) {
        if (def.loop) {
          this.cursor = 0
        } else {
          this.cursor = def.frames.length - 1
          this.finished = true
        }
      }
    }
    this.frame = def.frames[this.cursor]
  }
}
