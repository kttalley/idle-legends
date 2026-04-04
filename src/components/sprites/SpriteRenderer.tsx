import React, { useRef, useEffect } from 'react'

// ── Sprite Manifest Types ─────────────────────────────────────────────────────
interface FrameDesc {
  x: number
  y: number
  w: number
  h: number
  count: number
}

interface SpriteEntry {
  sheet: string
  frames: Record<string, FrameDesc>
  frameRate: number
}

type SpriteManifest = Record<string, SpriteEntry>

// In phase 1 we have no sprite sheets yet — empty manifest.
// When hand-drawn sheets are ready, populate this from a JSON import.
const SPRITE_MANIFEST: SpriteManifest = {}

// ── Placeholder Color Map ─────────────────────────────────────────────────────
// keyed by sprite key prefix
const PLACEHOLDER_COLORS: Record<string, string> = {
  player_:  '#44aa44',   // green — player characters
  mob_:     '#cc3333',   // red   — enemies
  item_:    '#3366cc',   // blue  — items
  mob_boss: '#cc6600',   // orange — bosses
  npc_:     '#ccaa00',   // gold  — NPCs
}

function placeholderColor(spriteKey: string): string {
  for (const [prefix, color] of Object.entries(PLACEHOLDER_COLORS)) {
    if (spriteKey.startsWith(prefix)) return color
  }
  return '#666666'
}

// ── Placeholder Renderer ──────────────────────────────────────────────────────
interface PlaceholderProps {
  spriteKey: string
  label: string
  width: number
  height: number
  animate?: boolean  // gentle breathing bob
}

export function PlaceholderSprite({ spriteKey, label, width, height, animate = true }: PlaceholderProps) {
  const color = placeholderColor(spriteKey)

  return (
    <div
      className={animate ? 'sprite-placeholder animate-bounce' : 'sprite-placeholder'}
      style={{
        width,
        height,
        background: color,
        border: '1px solid rgba(255,255,255,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(8, Math.floor(width / 6)),
        color: 'rgba(255,255,255,0.85)',
        fontWeight: 700,
        fontFamily: 'monospace',
        textAlign: 'center',
        padding: 2,
        userSelect: 'none',
        borderRadius: 2,
        flexShrink: 0,
        boxShadow: `0 0 8px ${color}88`,
        animationDuration: animate ? '2s' : undefined,
      }}
    >
      {label.split(' ').slice(0, 2).join('\n')}
    </div>
  )
}

// ── Canvas Sprite Renderer ────────────────────────────────────────────────────
interface SpriteRendererProps {
  spriteKey: string
  animation?: string  // e.g. 'idle', 'attack', 'death'
  label: string
  width?: number
  height?: number
  scale?: number
}

export function SpriteRenderer({
  spriteKey,
  animation = 'idle',
  label,
  width = 64,
  height = 64,
  scale = 1,
}: SpriteRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef  = useRef(0)
  const rafRef    = useRef<number | null>(null)

  const entry = SPRITE_MANIFEST[spriteKey]

  useEffect(() => {
    if (!entry) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.src = entry.sheet
    const frameDesc = entry.frames[animation] ?? entry.frames['idle']
    if (!frameDesc) return

    const interval = 1000 / entry.frameRate
    let lastFrameTime = performance.now()

    function draw(now: number) {
      if (now - lastFrameTime >= interval) {
        lastFrameTime = now
        frameRef.current = (frameRef.current + 1) % frameDesc.count
      }

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      ctx!.drawImage(
        img,
        frameDesc.x + frameRef.current * frameDesc.w,
        frameDesc.y,
        frameDesc.w,
        frameDesc.h,
        0, 0,
        canvas!.width,
        canvas!.height,
      )

      rafRef.current = requestAnimationFrame(draw)
    }

    img.onload = () => { rafRef.current = requestAnimationFrame(draw) }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [entry, animation])

  // If no real sprite, render placeholder
  if (!entry) {
    return (
      <PlaceholderSprite
        spriteKey={spriteKey}
        label={label}
        width={width * scale}
        height={height * scale}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: width * scale, height: height * scale, imageRendering: 'pixelated' }}
    />
  )
}
