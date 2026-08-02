import React, { useEffect, useRef, useState } from 'react'
import { AvatarRenderer, CLASS_PALETTES, hashStr } from './AvatarRenderer'
import { getSprite } from './spriteCache'
import { heroSpriteId } from '../../render/adapter/fftaRoster'
import { heroPaletteId } from '../../render/adapter/heroWardrobe'
import { Scene, type Camera } from '../../render/scene'
import { bakeGround, feetX, feetY, type GroundBuffer } from '../../render/tilemap'
import { getPalette } from '../../render/palettes'
import { makeTileset, makePropSheet, TILE, TILE_ANIMS } from '../../render/placeholderArt'
import type { ClassType, FactionType, RaceType, Rarity } from '../../data/types'
import type { Facing } from '../../render/types'

const CSS_SCALE = 3   // internal buffer is 1/3 CSS size, then CSS-upscaled (pixelated)

interface HeroAvatarProps {
  race:        RaceType
  playerClass: ClassType
  name:        string
  faction:     FactionType
  rarity?:     Rarity
  size?:       number      // CSS px, default 72
  animate?:    boolean     // default true
  facing?:     Facing      // default 'se'
  circle?:     boolean     // default true
}

/** A single, self-contained dimetric avatar that renders the actual sprite a hero will
 *  wear in the world (originals by default; the FFTA scaffold under `?ffta` in dev).
 *  Falls back to the procedural AvatarRenderer only if the sprite genuinely fails to
 *  load, so the screens always work.
 *
 *  Until 2026-08-01 this bailed to the procedural fallback whenever `?noffta` was set,
 *  which meant character select never once displayed an original rig — the flag that
 *  selected the shippable art was the same flag that made this component stop using it. */
export function HeroAvatar({
  race,
  playerClass,
  name,
  faction,
  rarity = 'common',
  size = 72,
  animate = true,
  facing = 'se',
  circle = true,
}: HeroAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const spriteId = heroSpriteId(race, playerClass, name)
  const paletteId = heroPaletteId(playerClass, race, faction, rarity)

  // Procedural fallback seed: stable for this hero but distinct across classes.
  const fallbackSeed = hashStr(name) ^ hashStr(playerClass)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let raf = 0
    let scene: Scene | null = null
    let hero: ReturnType<Scene['spawn']> | null = null
    let ground: GroundBuffer | null = null

    const vw = Math.floor(size / CSS_SCALE)
    const vh = Math.floor(size / CSS_SCALE)
    canvas.width = vw
    canvas.height = vh
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    ;(async () => {
      const sprite = await getSprite(spriteId)
      if (disposed) return

      // Small grass patch as a backdrop.
      const tileset = makeTileset()
      const propSheet = makePropSheet()
      const W = 4, H = 4
      const tiles = new Uint8Array(W * H)
      for (let i = 0; i < tiles.length; i++) {
        tiles[i] = (i * 7) % 3 === 0 ? TILE.GRASS_ALT : TILE.GRASS
      }
      ground = bakeGround(
        { w: W, h: H, tiles, props: [] },
        tileset,
        'biome/meadow',
        getPalette('biome/meadow'),
        TILE_ANIMS,
        propSheet,
      )

      scene = new Scene()
      const cx = 1.5, cy = 1.5
      hero = scene.spawn(sprite, paletteId, cx, cy)
      hero.animator.set('idle')
      hero.animator.face(facing)

      // Frame the shot on the upper body / face rather than the feet, so a circular
      // avatar crop keeps the character readable instead of showing mostly grass.
      const cam: Camera = { x: 0, y: 0, w: vw, h: vh }
      const heroSprite = hero.sprite
      const faceX = feetX(ground, cx, cy) + (heroSprite.frameW / 2 - heroSprite.anchor.x)
      const faceY = feetY(ground, cx, cy) - heroSprite.frameH * 0.50
      cam.x = faceX - vw / 2
      cam.y = faceY - vh / 2

      setReady(true)

      if (!animate) {
        scene.update(0)
        scene.render(ctx, cam, ground, 0)
        return
      }

      let last = performance.now()
      const frame = (now: number) => {
        if (disposed) return
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        hero!.paletteId = paletteId
        scene!.update(dt)
        scene!.render(ctx, cam, ground!, dt)
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    })().catch(err => {
      console.error('[HeroAvatar] failed to load sprite', spriteId, err)
      setFailed(true)
    })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      setReady(false)
    }
  }, [spriteId, paletteId, size, animate, facing])

  // Fallback path: procedural avatar.
  if (failed) {
    return (
      <AvatarRenderer
        seed={fallbackSeed}
        palette={CLASS_PALETTES[playerClass] ?? CLASS_PALETTES.warrior}
        cellSize={Math.max(7, Math.floor(size / 10))}
        animate={animate}
        circle={circle}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        borderRadius: circle ? '50%' : 10,
        background: 'radial-gradient(ellipse at 50% 40%, #26324a 0%, #141a26 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,215,0,0.15)',
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    />
  )
}
