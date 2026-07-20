import React, { useEffect, useRef } from 'react'
import { loadSpriteOrPlaceholder } from '../../render/indexedSprite'
import { makeHumanoidRig, makeTileset, makePropSheet, TILE, TILE_ANIMS } from '../../render/placeholderArt'
import { bakeGround, feetX, feetY, type GroundBuffer } from '../../render/tilemap'
import { getPalette } from '../../render/palettes'
import { Scene, type Camera, type Entity } from '../../render/scene'
import { heroPaletteId } from '../../render/adapter/heroWardrobe'
import type { ClassType, RaceType, FactionType } from '../../data/types'

const CSS_SCALE = 3   // 1× buffer, CSS-upscaled 3× (image-rendering: pixelated)

interface HeroPreviewProps {
  playerClass: ClassType
  race:        RaceType
  faction:     FactionType
  /** CSS pixel size of the square preview. */
  size?:       number
}

// A single idle hero on a small grass patch, rendered with the real dimetric engine
// so the creation preview is exactly what plays in-world. Recolors live: when the
// class/race/faction props change, only the entity's palette id is swapped (the
// wardrobe is data — no re-bake of the rig, no re-init of the scene).
export function HeroPreview({ playerClass, race, faction, size = 168 }: HeroPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Latest look, read by the render loop each frame (avoids re-init on prop change).
  const lookRef = useRef({ playerClass, race, faction })
  lookRef.current = { playerClass, race, faction }

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const vw = Math.floor(size / CSS_SCALE)
    const vh = Math.floor(size / CSS_SCALE)
    canvas.width = vw
    canvas.height = vh
    ctx.imageSmoothingEnabled = false

    let raf = 0
    let disposed = false
    let scene: Scene | null = null
    let hero: Entity | null = null
    let ground: GroundBuffer | null = null

    const base = import.meta.env.BASE_URL
    const scaffold = `${base}local-assets/ffta-scaffold/`

    ;(async () => {
      // Same rig the in-world hero uses (scaffold-first, programmatic fallback).
      const rig = await loadSpriteOrPlaceholder(`${scaffold}hero.json`, () => makeHumanoidRig('rig/humanoid'))
      if (disposed) return

      // A small grass patch as a backdrop; the hero stands on its center tile.
      const tileset = makeTileset()
      const propSheet = makePropSheet()
      const W = 4, H = 4
      const tiles = new Uint8Array(W * H)
      for (let i = 0; i < tiles.length; i++) tiles[i] = (i * 7) % 3 === 0 ? TILE.GRASS_ALT : TILE.GRASS
      ground = bakeGround({ w: W, h: H, tiles, props: [] }, tileset, 'biome/meadow', getPalette('biome/meadow'), TILE_ANIMS, propSheet)

      scene = new Scene()
      const cx = 1.5, cy = 1.5   // center of the 4×4 patch
      hero = scene.spawn(rig, heroPaletteId(playerClass, race, faction), cx, cy)
      hero.animator.set('idle')
      hero.animator.face('se')   // 3/4 front-facing, matches the in-world default

      const cam: Camera = { x: 0, y: 0, w: vw, h: vh }
      // Center the camera on the hero's feet, then lift so the body sits mid-frame.
      cam.x = feetX(ground, cx, cy) - vw / 2
      cam.y = feetY(ground, cx, cy) - vh / 2 - 8

      let last = performance.now()
      const frame = (now: number) => {
        if (disposed) return
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        hero!.paletteId = heroPaletteId(
          lookRef.current.playerClass, lookRef.current.race, lookRef.current.faction,
        )
        scene!.update(dt)
        scene!.render(ctx, cam, ground!, dt)
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    })()

    return () => { disposed = true; cancelAnimationFrame(raf) }
  }, [size])  // eslint-disable-line react-hooks/exhaustive-deps -- look changes are read live via lookRef

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        borderRadius: 10,
        background: 'radial-gradient(ellipse at 50% 40%, #26324a 0%, #141a26 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,215,0,0.15)',
      }}
    />
  )
}
