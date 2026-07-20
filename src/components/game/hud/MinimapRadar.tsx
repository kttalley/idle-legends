import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { ZONES } from '../../../data/zones'
import type { ZoneMap, TileType } from '../../../data/types'

// Top-left "radar": the current zone's 64×64 ZoneMap baked to a small north-up canvas,
// with live player / mob / node blips over it. The terrain bake is cached per zone
// (it never changes); only the blips redraw per tick. Static north-up (not rotating)
// keeps it cheap and legible — the player dot moves across a fixed map.

const MAP = 64
const PX = 2                 // pixels per tile
const SIZE = MAP * PX        // 128px canvas

function tileColor(type: TileType): string {
  switch (type) {
    case 'water':  return '#25415f'
    case 'cliff':  return '#5c5348'
    case 'sand':   return '#9c8b58'
    case 'rock':   return '#6b5a49'
    case 'snow':   return '#c2c8d0'
    case 'moss':   return '#2f4a26'
    case 'flower': return '#4a6236'
    default:       return '#3c5730' // terrain / grass
  }
}

/** Bake the terrain to an offscreen canvas once per zone. */
function bakeTerrain(zm: ZoneMap): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  const ctx = c.getContext('2d')!
  for (let y = 0; y < MAP; y++) {
    const row = zm.tiles[y]
    if (!row) continue
    for (let x = 0; x < MAP; x++) {
      const t = row[x]
      if (!t) continue
      ctx.fillStyle = tileColor(t.type)
      ctx.fillRect(x * PX, y * PX, PX, PX)
    }
  }
  return c
}

export function MinimapRadar() {
  const currentZone = useGameStore(s => s.currentZone)
  const zoneMaps    = useGameStore(s => s.zoneMaps)
  const playerPos   = useGameStore(s => s.playerMapPos)
  const mobOffset   = useGameStore(s => s.mobMapOffset)
  const hasMob      = useGameStore(s => s.currentMob !== null)
  const zoneNames   = useGameStore(s => s.generatedZoneNames)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bakedRef  = useRef<{ zone: string; canvas: HTMLCanvasElement } | null>(null)

  const zm = zoneMaps[currentZone]
  const zoneName = zoneNames[currentZone] ?? ZONES[currentZone]?.name ?? 'Unknown'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !zm) return
    const ctx = canvas.getContext('2d')!

    // Rebake terrain only when the zone changes.
    if (!bakedRef.current || bakedRef.current.zone !== currentZone) {
      bakedRef.current = { zone: currentZone, canvas: bakeTerrain(zm) }
    }
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(bakedRef.current.canvas, 0, 0)

    // Node blips (ore/herb/mob spawn/boss lair) — use the node's own color.
    for (const node of zm.nodes) {
      ctx.fillStyle = node.color
      ctx.fillRect(node.x * PX - 1, node.y * PX - 1, PX + 1, PX + 1)
    }

    // Mob blip (player pos + offset, torus-wrapped).
    if (hasMob) {
      const mx = (((playerPos.x + mobOffset.dx) % MAP) + MAP) % MAP
      const my = (((playerPos.y + mobOffset.dy) % MAP) + MAP) % MAP
      ctx.fillStyle = '#ff3b30'
      ctx.beginPath()
      ctx.arc(mx * PX, my * PX, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Player blip (gold, ringed).
    const px = playerPos.x * PX
    const py = playerPos.y * PX
    ctx.fillStyle = '#ffd54a'
    ctx.beginPath()
    ctx.arc(px, py, 2.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#7a5a10'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [currentZone, zm, playerPos, mobOffset, hasMob])

  return (
    <div
      style={{
        pointerEvents: 'auto',
        background: 'rgba(8,8,14,0.82)',
        border: '1px solid #3a3630',
        borderRadius: 6,
        padding: 5,
        width: SIZE + 10,
      }}
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{ display: 'block', borderRadius: 3, imageRendering: 'pixelated', width: SIZE, height: SIZE }}
      />
      <div style={{
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#b8a878',
        marginTop: 4,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {zoneName}
      </div>
    </div>
  )
}
