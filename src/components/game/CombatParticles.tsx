import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttackKind = 'spell' | 'melee_slash' | 'melee_blunt' | 'crit_slash' | 'crit_blunt' | 'mob'

export interface CombatParticlesHandle {
  fireAttack(kind: AttackKind, color: string, glowColor: string): void
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number      // 1.0 → 0.0
  decay: number     // life lost per ms
  r: number
  color: string
  glow: string
  shape: 'orb' | 'spark' | 'ring'
  angle?: number    // for sparks drawn as short lines
}

interface Projectile {
  srcX: number; srcY: number
  dstX: number; dstY: number
  x: number; y: number
  progress: number  // 0 → 1
  duration: number  // ms
  elapsed: number
  r: number
  color: string
  glow: string
  kind: AttackKind
  trail: Array<{ x: number; y: number; alpha: number }>
  done: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(lo: number, hi: number) { return lo + Math.random() * (hi - lo) }
function randInt(lo: number, hi: number) { return Math.floor(rand(lo, hi + 1)) }

function isCrit(kind: AttackKind) { return kind === 'crit_slash' || kind === 'crit_blunt' }
function isSlash(kind: AttackKind) { return kind === 'melee_slash' || kind === 'crit_slash' }
function isBlunt(kind: AttackKind) { return kind === 'melee_blunt' || kind === 'crit_blunt' }
function isMelee(kind: AttackKind) { return isSlash(kind) || isBlunt(kind) }

function spawnImpact(
  particles: Particle[],
  x: number, y: number,
  color: string, glow: string,
  kind: AttackKind,
) {
  const crit  = isCrit(kind)
  const count = crit ? 20 : kind === 'spell' ? 14 : 10
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3)
    const speed = crit ? rand(2.5, 6) : rand(1.5, 4)
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: crit ? rand(0.008, 0.016) : rand(0.012, 0.022),
      r: crit ? rand(2, 5) : rand(1.5, 3.5),
      color, glow,
      shape: 'spark',
      angle,
    })
  }
  // Ring flash
  particles.push({ x, y, vx: 0, vy: 0, life: 1, decay: 0.04, r: 2, color, glow, shape: 'ring' })
}

// Draw 2-3 slash arc strokes at position, in direction of travel
function drawSlashStrokes(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  progress: number,
  travelAngle: number,
  color: string, glow: string,
  alpha: number,
  isCritHit: boolean,
) {
  const count     = isCritHit ? 3 : 2
  const len       = isCritHit ? 28 : 20
  const lineWidth = isCritHit ? 4 : 2.5
  // Peak at 50% travel, fade out
  const fade = Math.sin(progress * Math.PI) * alpha

  ctx.save()
  ctx.globalAlpha = Math.max(0, fade)
  ctx.shadowColor = glow
  ctx.shadowBlur  = lineWidth * 5
  ctx.strokeStyle = color
  ctx.lineCap     = 'round'

  for (let i = 0; i < count; i++) {
    // Each slash offset perpendicular to travel direction, spread out
    const spread     = (i - (count - 1) / 2) * (isCritHit ? 12 : 9)
    const perpAngle  = travelAngle + Math.PI / 2
    const ox = Math.cos(perpAngle) * spread
    const oy = Math.sin(perpAngle) * spread

    // Diagonal slash perpendicular to travel, with slight curve
    const slashAngle = travelAngle - Math.PI / 4   // 45° off travel
    const sx = x + ox - Math.cos(slashAngle) * len / 2
    const sy = y + oy - Math.sin(slashAngle) * len / 2
    const ex = x + ox + Math.cos(slashAngle) * len / 2
    const ey = y + oy + Math.sin(slashAngle) * len / 2
    // Control point curves the slash slightly
    const cpx = x + ox + Math.cos(travelAngle) * (len * 0.3)
    const cpy = y + oy + Math.sin(travelAngle) * (len * 0.3)

    ctx.lineWidth = lineWidth * (1 - Math.abs(i - (count - 1) / 2) / count * 0.5)
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    ctx.stroke()
  }
  ctx.restore()
}

// Draw POW-style radial burst for blunt
function drawBluntImpact(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  progress: number,
  color: string, glow: string,
  alpha: number,
  isCritHit: boolean,
) {
  const fade    = Math.sin(progress * Math.PI) * alpha
  const rays    = isCritHit ? 10 : 7
  const innerR  = isCritHit ? 6 : 4
  const outerR  = (isCritHit ? 22 : 16) * (0.5 + progress * 0.5)

  ctx.save()
  ctx.globalAlpha = Math.max(0, fade)
  ctx.shadowColor = glow
  ctx.shadowBlur  = 14

  // Star polygon
  ctx.beginPath()
  for (let i = 0; i < rays * 2; i++) {
    const r     = i % 2 === 0 ? outerR : innerR
    const angle = (i / (rays * 2)) * Math.PI * 2 - Math.PI / 2
    const px    = x + Math.cos(angle) * r
    const py    = y + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()

  // Outer ring
  ctx.strokeStyle = glow
  ctx.lineWidth   = isCritHit ? 2.5 : 1.5
  ctx.beginPath()
  ctx.arc(x, y, outerR * 1.2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  playerRef: React.RefObject<HTMLDivElement | null>
  mobRef: React.RefObject<HTMLDivElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
}

export const CombatParticles = forwardRef<CombatParticlesHandle, Props>(
  function CombatParticles({ playerRef, mobRef, containerRef }, ref) {
    const canvasRef   = useRef<HTMLCanvasElement>(null)
    const projectiles = useRef<Projectile[]>([])
    const particles   = useRef<Particle[]>([])
    const rafId       = useRef<number>(0)
    const lastTime    = useRef<number>(0)
    const running     = useRef(false)

    // Get pixel coords of a DOM element relative to the container
    function getCenter(el: HTMLElement | null, container: HTMLElement | null): { x: number; y: number } | null {
      if (!el || !container) return null
      const eRect = el.getBoundingClientRect()
      const cRect = container.getBoundingClientRect()
      return {
        x: eRect.left + eRect.width / 2 - cRect.left,
        y: eRect.top  + eRect.height / 2 - cRect.top,
      }
    }

    const loop = useCallback((now: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const dt  = Math.min(now - lastTime.current, 50) // cap delta at 50ms
      lastTime.current = now

      // Resize canvas to match container
      const container = containerRef.current
      if (container) {
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
          canvas.width  = container.clientWidth
          canvas.height = container.clientHeight
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // ── Update + draw projectiles ──────────────────────────────────────────
      for (const proj of projectiles.current) {
        if (proj.done) continue
        proj.elapsed += dt
        proj.progress = Math.min(1, proj.elapsed / proj.duration)

        // Easing: ease-in-out for spell, linear for melee
        const t = proj.kind === 'spell' || proj.kind === 'mob'
          ? proj.progress < 0.5
            ? 2 * proj.progress * proj.progress
            : 1 - Math.pow(-2 * proj.progress + 2, 2) / 2
          : proj.progress

        proj.x = proj.srcX + (proj.dstX - proj.srcX) * t
        proj.y = proj.srcY + (proj.dstY - proj.srcY) * t

        // Arc offset: spell arcs slightly, melee arcs more dramatically
        if (isMelee(proj.kind)) {
          proj.y += Math.sin(proj.progress * Math.PI) * -24
        }

        // Travel angle for slash orientation
        const travelAngle = Math.atan2(proj.dstY - proj.srcY, proj.dstX - proj.srcX)

        if (isSlash(proj.kind)) {
          // ── Slash: arc strokes + minimal trail ────────────────────────────
          drawSlashStrokes(ctx, proj.x, proj.y, proj.progress, travelAngle,
            proj.color, proj.glow, 1, isCrit(proj.kind))

          // Light motion trail
          proj.trail.push({ x: proj.x, y: proj.y, alpha: 1 })
          if (proj.trail.length > 6) proj.trail.shift()
          for (let i = 0; i < proj.trail.length; i++) {
            const tp = proj.trail[i]
            ctx.save()
            ctx.globalAlpha = (i / proj.trail.length) * 0.3
            ctx.shadowColor = proj.glow
            ctx.shadowBlur  = 6
            ctx.fillStyle   = proj.color
            ctx.beginPath()
            ctx.arc(tp.x, tp.y, 2, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }

        } else if (isBlunt(proj.kind)) {
          // ── Blunt: POW burst expanding as it travels ──────────────────────
          drawBluntImpact(ctx, proj.x, proj.y, proj.progress,
            proj.color, proj.glow, 1, isCrit(proj.kind))

        } else {
          // ── Spell / mob: glowing orb with trail ───────────────────────────
          proj.trail.push({ x: proj.x, y: proj.y, alpha: 1 })
          if (proj.trail.length > 14) proj.trail.shift()

          for (let i = 0; i < proj.trail.length; i++) {
            const tp = proj.trail[i]
            const a  = (i / proj.trail.length) * 0.6
            const r  = proj.r * (i / proj.trail.length) * 0.7
            ctx.save()
            ctx.globalAlpha = a
            ctx.shadowColor = proj.glow
            ctx.shadowBlur  = r * 4
            ctx.fillStyle   = proj.color
            ctx.beginPath()
            ctx.arc(tp.x, tp.y, Math.max(0.5, r), 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }

          const orbR = proj.r * (1 + Math.sin(proj.progress * Math.PI) * 0.3)
          ctx.save()
          ctx.globalAlpha = 1
          ctx.shadowColor = proj.glow
          ctx.shadowBlur  = orbR * 6
          const grad = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, orbR * 2)
          grad.addColorStop(0, proj.glow)
          grad.addColorStop(0.5, proj.color)
          grad.addColorStop(1, 'transparent')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(proj.x, proj.y, orbR * 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }

        // On arrival
        if (proj.progress >= 1 && !proj.done) {
          proj.done = true
          spawnImpact(particles.current, proj.dstX, proj.dstY, proj.color, proj.glow, proj.kind)
        }
      }

      // Prune done projectiles
      projectiles.current = projectiles.current.filter(p => !p.done || p.elapsed < p.duration + 100)

      // ── Update + draw particles ────────────────────────────────────────────
      for (const p of particles.current) {
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.92
        p.vy *= 0.92
        p.life -= p.decay * dt

        if (p.life <= 0) continue

        ctx.save()
        ctx.globalAlpha = Math.max(0, p.life)

        if (p.shape === 'ring') {
          const ringR = (1 - p.life) * 40 + 5
          ctx.shadowColor = p.glow
          ctx.shadowBlur  = 12
          ctx.strokeStyle = p.color
          ctx.lineWidth   = Math.max(0.5, p.life * 3)
          ctx.beginPath()
          ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.shadowColor = p.glow
          ctx.shadowBlur  = p.r * 5
          ctx.fillStyle   = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0.3, p.r * p.life), 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()
      }

      // Prune dead particles
      particles.current = particles.current.filter(p => p.life > 0)

      const stillActive = projectiles.current.length > 0 || particles.current.length > 0
      if (stillActive) {
        rafId.current = requestAnimationFrame(loop)
      } else {
        running.current = false
      }
    }, [containerRef])

    function startLoop() {
      if (running.current) return
      running.current = true
      lastTime.current = performance.now()
      rafId.current = requestAnimationFrame(loop)
    }

    useImperativeHandle(ref, () => ({
      fireAttack(kind: AttackKind, color: string, glowColor: string) {
        const container = containerRef.current
        const playerEl  = playerRef.current
        const mobEl     = mobRef.current

        const playerPos = getCenter(playerEl, container)
        const mobPos    = getCenter(mobEl, container)
        if (!playerPos || !mobPos) return

        const fromPos = kind === 'mob' ? mobPos    : playerPos
        const toPos   = kind === 'mob' ? playerPos : mobPos

        const duration =
          kind === 'melee_slash' ? 200 :
          kind === 'melee_blunt' ? 220 :
          kind === 'crit_slash'  ? 260 :
          kind === 'crit_blunt'  ? 280 :
          350  // spell / mob

        const proj: Projectile = {
          srcX: fromPos.x, srcY: fromPos.y,
          dstX: toPos.x,   dstY: toPos.y,
          x: fromPos.x,    y: fromPos.y,
          progress: 0,
          duration,
          elapsed: 0,
          r: isCrit(kind) ? 8 : isMelee(kind) ? 5 : 6,
          color, glow: glowColor,
          kind,
          trail: [],
          done: false,
        }

        // Extra sparks at launch site
        const launchCount = kind === 'crit' ? 8 : 4
        for (let i = 0; i < launchCount; i++) {
          const angle = rand(0, Math.PI * 2)
          const speed = rand(0.5, 2)
          particles.current.push({
            x: fromPos.x, y: fromPos.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: rand(0.025, 0.045),
            r: rand(1, 3),
            color, glow: glowColor,
            shape: 'spark',
          })
        }

        projectiles.current.push(proj)
        startLoop()
      }
    }))

    useEffect(() => {
      return () => {
        cancelAnimationFrame(rafId.current)
        running.current = false
      }
    }, [])

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    )
  }
)
