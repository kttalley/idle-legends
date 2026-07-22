import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { ZONES } from '../../../data/zones'
import { ZoneSelector } from '../ZoneSelector'
import type { ZoneMap, TileType } from '../../../data/types'

// Top-right circular radar: the current zone's 64×64 ZoneMap baked to an offscreen
// canvas (cached per zone), player-centered so the player sits at the disc center with
// the world scrolling under it, clipped to a circle. Compact (~0.5 the old size). A map
// button opens the zone fast-travel list.

const MAP = 64
const SRC = 128          // offscreen bake resolution (2px/tile)
const VIEW = 74          // on-screen disc diameter (css px)
const SPAN = 30          // tiles visible across the disc (player-centered window)

function tileColor(type: TileType): string {
  switch (type) {
    case 'water':  return '#25415f'
    case 'cliff':  return '#5c5348'
    case 'sand':   return '#9c8b58'
    case 'rock':   return '#6b5a49'
    case 'snow':   return '#c2c8d0'
    case 'moss':   return '#2f4a26'
    case 'flower': return '#4a6236'
    default:       return '#3c5730'
  }
}

function bakeTerrain(zm: ZoneMap): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SRC; c.height = SRC
  const ctx = c.getContext('2d')!
  const s = SRC / MAP
  for (let y = 0; y < MAP; y++) {
    const row = zm.tiles[y]
    if (!row) continue
    for (let x = 0; x < MAP; x++) {
      const t = row[x]; if (!t) continue
      ctx.fillStyle = tileColor(t.type)
      ctx.fillRect(x * s, y * s, s, s)
    }
  }
  return c
}

const ZOOM_LABELS = ['Wide', 'Medium', 'Close'] // by zoom step (0 → 2)

export function MinimapRadar() {
  const currentZone = useGameStore(s => s.currentZone)
  const zoneMaps    = useGameStore(s => s.zoneMaps)
  const playerPos   = useGameStore(s => s.playerMapPos)
  const mobOffset   = useGameStore(s => s.mobMapOffset)
  const hasMob      = useGameStore(s => s.currentMob !== null)
  const zoneNames   = useGameStore(s => s.generatedZoneNames)
  const zoomLevel   = useGameStore(s => s.zoomLevel)
  const cycleZoom   = useGameStore(s => s.cycleZoom)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bakedRef  = useRef<{ zone: string; canvas: HTMLCanvasElement } | null>(null)
  const [mapOpen, setMapOpen] = useState(false)

  const zm = zoneMaps[currentZone]
  const zoneName = zoneNames[currentZone] ?? ZONES[currentZone]?.name ?? 'Unknown'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !zm) return
    const ctx = canvas.getContext('2d')!
    if (!bakedRef.current || bakedRef.current.zone !== currentZone) {
      bakedRef.current = { zone: currentZone, canvas: bakeTerrain(zm) }
    }

    // Player-centered window: draw a SPAN-tile region of the baked map around the
    // player into the VIEW disc. px/tile on screen:
    const scale = VIEW / SPAN
    const srcPerTile = SRC / MAP
    ctx.clearRect(0, 0, VIEW, VIEW)
    ctx.imageSmoothingEnabled = false
    // Source rect centered on the player (in offscreen px), torus-wrapped by drawing
    // the baked canvas at three offsets so edges are seamless.
    const cxTile = playerPos.x, cyTile = playerPos.y
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const sx = (cxTile + ox * MAP - SPAN / 2) * srcPerTile
        const sy = (cyTile + oy * MAP - SPAN / 2) * srcPerTile
        ctx.drawImage(bakedRef.current.canvas,
          sx, sy, SPAN * srcPerTile, SPAN * srcPerTile,
          0, 0, VIEW, VIEW)
      }
    }

    const toDisc = (tx: number, ty: number) => ({
      x: VIEW / 2 + (tx - cxTile) * scale,
      y: VIEW / 2 + (ty - cyTile) * scale,
    })

    // Node blips within range.
    for (const node of zm.nodes) {
      // nearest wrapped copy
      let dx = node.x - cxTile; dx = ((dx + MAP / 2 + MAP) % MAP) - MAP / 2
      let dy = node.y - cyTile; dy = ((dy + MAP / 2 + MAP) % MAP) - MAP / 2
      if (Math.abs(dx) > SPAN / 2 || Math.abs(dy) > SPAN / 2) continue
      ctx.fillStyle = node.color
      ctx.fillRect(VIEW / 2 + dx * scale - 1, VIEW / 2 + dy * scale - 1, 2, 2)
    }

    // Mob blip.
    if (hasMob) {
      const p = toDisc(cxTile + mobOffset.dx, cyTile + mobOffset.dy)
      ctx.fillStyle = '#ff3b30'
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill()
    }

    // Player at center.
    ctx.fillStyle = '#ffd54a'
    ctx.beginPath(); ctx.arc(VIEW / 2, VIEW / 2, 2.8, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 1; ctx.stroke()
  }, [currentZone, zm, playerPos, mobOffset, hasMob])

  return (
    <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ position: 'relative', width: VIEW, height: VIEW }}>
        <canvas
          ref={canvasRef}
          width={VIEW}
          height={VIEW}
          style={{
            width: VIEW, height: VIEW, display: 'block',
            borderRadius: '50%',
            border: '2px solid #3a3630',
            boxShadow: '0 0 0 1px #000, inset 0 0 8px rgba(0,0,0,0.6)',
            background: '#0a0e14',
          }}
        />
        {/* Map / fast-travel button, tucked on the disc edge (bottom-right) */}
        <button
          onClick={() => setMapOpen(true)}
          title="World map — fast travel"
          style={{
            position: 'absolute', right: -4, bottom: -4,
            width: 22, height: 22, borderRadius: '50%',
            border: '1px solid #6b5020', background: 'rgba(20,16,8,0.95)',
            color: '#ffd700', fontSize: 12, cursor: 'pointer', lineHeight: '20px', padding: 0,
          }}
        >
          🗺
        </button>
        {/* Zoom cycle button, opposite the map (bottom-left): Wide → Medium → Close → Wide */}
        <button
          onClick={cycleZoom}
          title={`Zoom: ${ZOOM_LABELS[zoomLevel]} — tap to ${zoomLevel === ZOOM_LABELS.length - 1 ? 'reset to Wide' : 'zoom in'}`}
          style={{
            position: 'absolute', left: -4, bottom: -4,
            width: 22, height: 22, borderRadius: '50%',
            border: '1px solid #6b5020', background: 'rgba(20,16,8,0.95)',
            color: '#ffd700', fontSize: 12, cursor: 'pointer', lineHeight: '20px', padding: 0,
          }}
        >
          🔍
          {/* current step indicator (1–3) */}
          <span style={{
            position: 'absolute', right: -3, top: -3,
            minWidth: 11, height: 11, borderRadius: 6,
            background: '#3a2c0e', border: '1px solid #6b5020',
            color: '#ffe9a8', fontSize: 8, fontWeight: 700, lineHeight: '10px',
            textAlign: 'center', padding: '0 1px',
          }}>
            {zoomLevel + 1}
          </span>
        </button>
      </div>
      <div style={{
        fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c8b890',
        textShadow: '0 1px 2px #000', maxWidth: VIEW + 12, textAlign: 'center',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {zoneName}
      </div>

      {mapOpen && (
        <div
          onClick={() => setMapOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(340px, 92vw)' }}>
            <ZoneSelector />
            <button
              onClick={() => setMapOpen(false)}
              className="rp-button"
              style={{ marginTop: 6, width: '100%', fontSize: '0.7rem' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
