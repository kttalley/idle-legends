// ── Combat gate readout (DEV only) ────────────────────────────────────────────
//
// Every value the tick consults before anyone is allowed to swing, on screen, live.
//
// This exists because a headless probe misled me three times about the same bug. It
// measured renderer coordinates (which carry PAD and the manual-mode visual offset)
// instead of the store's, and later spent an entire run testing a BOSS — a boss empties
// the field and blocks all other spawns, so a hero too weak to kill one never meets a
// crowd at all. Both times the probe reported "working" against a screen that plainly was
// not. A number the player can read off their own screen settles that in one glance.
//
// Read it as: if `engaged` is false, look at `off` against `mobRange` — a mob resting
// outside its own reach is the failure this was built to catch.
import { useGameStore } from '../../store/gameStore'
import { attackRangeOf, heroAttackRange } from '../../engine/mobBehaviour'

export function CombatDebugReadout() {
  const mobs = useGameStore(s => s.mobs)
  const targetId = useGameStore(s => s.targetMobId)
  const controlMode = useGameStore(s => s.controlMode)
  const gameMode = useGameStore(s => s.gameMode)
  const playerClass = useGameStore(s => s.playerClass)
  const isAlive = useGameStore(s => s.isAlive)

  const dist = (m: { offset: { dx: number; dy: number } }) =>
    Math.sqrt(m.offset.dx ** 2 + m.offset.dy ** 2)

  const target = mobs.find(m => m.id === targetId) ?? null
  const heroRange = heroAttackRange(playerClass)
  const nearest = [...mobs].sort((a, b) => dist(a) - dist(b))[0] ?? null
  const shown = target ?? nearest

  const row = (label: string, value: string, bad = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: '#8a8a96' }}>{label}</span>
      <span style={{ color: bad ? '#ff6b6b' : '#d4b896' }}>{value}</span>
    </div>
  )

  const off = shown ? dist(shown) : null
  const mobRange = shown ? attackRangeOf(shown) : 0
  const mobCanHit = !!shown && off !== null && off < mobRange && shown.aggro
  const heroCanHit = !!shown && off !== null && off < heroRange

  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 40, pointerEvents: 'none',
      background: 'rgba(8,8,14,0.82)', border: '1px solid #3a2c10', borderRadius: 4,
      padding: '6px 8px', minWidth: 190,
      font: '11px ui-monospace, monospace', lineHeight: 1.5,
    }}>
      <div style={{ color: '#ffd700', marginBottom: 3 }}>combat gates</div>
      {row('mode', `${controlMode} / ${gameMode}${isAlive ? '' : ' / DEAD'}`)}
      {row('mobs', String(mobs.length))}
      {row('target', targetId ? targetId : 'none', !targetId)}
      {!shown && row('nearest', 'no mobs', true)}
      {shown && (
        <>
          {row('name', shown.name.slice(0, 20))}
          {row('aggro', shown.aggro ? 'yes' : 'NO', !shown.aggro)}
          {row('off', off!.toFixed(2))}
          {row('mobRange', mobRange.toFixed(2))}
          {row('heroRange', heroRange.toFixed(2))}
          {row('MOB can hit', mobCanHit ? 'yes' : 'NO', !mobCanHit)}
          {row('HERO can hit', heroCanHit ? 'yes' : 'NO', !heroCanHit)}
        </>
      )}
    </div>
  )
}
