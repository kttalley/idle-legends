// ── Zone boss beacon ──────────────────────────────────────────────────────────
//
// While the zone boss is alive, say so, and say which way it is.
//
// The boss gate is silent in a way that reads exactly like a broken counter. Once
// `totalZoneKills` reaches the zone's `unlockKills`, `spawnMob` returns the boss,
// `mobs = [spawned]` empties the field for it, and `isBossPresent` blocks every further
// spawn while it lives. So the kill counter stops moving, the zone goes quiet, and the
// only notification is one combat-log line that scrolls away within seconds.
//
// A lair boss also never pursues (`advanceMobs` skips `temperament: 'lair'`) and spawns
// 14–20 tiles out, so under manual control it will sit there forever waiting to be walked
// to. A player who does not know it spawned experiences all of this as "my kills stopped
// counting" — which is precisely how it was reported.
//
// So: a persistent marker, with a bearing and a distance, for as long as the boss stands.
import { useGameStore } from '../../store/gameStore'

/** Eight-point compass from a dx/dy in tile space. The world is drawn dimetrically, but
 *  the store's axes are the ones the player's own WASD moves along, so these agree with
 *  the keys under their fingers. */
function bearing(dx: number, dy: number): string {
  const ang = Math.atan2(dy, dx)
  const i = Math.round(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8
  return ['W', 'NW', 'N', 'NE', 'E', 'SE', 'S', 'SW'][i]
}

export function BossBeacon() {
  const mobs = useGameStore(s => s.mobs)
  const gameMode = useGameStore(s => s.gameMode)
  const isAlive = useGameStore(s => s.isAlive)

  const boss = mobs.find(m => m.isBoss && m.currentHp > 0)
  if (!boss || gameMode !== 'combat' || !isAlive) return null

  const dist = Math.sqrt(boss.offset.dx ** 2 + boss.offset.dy ** 2)
  const hpPct = Math.max(0, Math.min(1, boss.currentHp / boss.maxHp))
  // Strip the display prefix the store adds; the label below already says BOSS.
  const name = boss.name.replace(/^\[BOSS\]\s*/, '')

  return (
    <div style={{
      position: 'absolute',
      // Top-aligned with the rest of the HUD (`.hud-tl` / `.hud-tr` use the same
      // expression). A bare `top: 8` put this banner UNDER the Dynamic Island on a Pro
      // phone and ate the first line of it — the one naming the boss. This element sits in
      // the scene wrapper, which is full-bleed and applies no inset of its own, so the
      // safe-area has to be added here.
      top: 'calc(8px + var(--safe-t))',
      left: '50%', transform: 'translateX(-50%)',
      zIndex: 40, pointerEvents: 'none',
      background: 'rgba(24,8,4,0.88)', border: '1px solid var(--warn)', borderRadius: 4,
      padding: '5px 10px', minWidth: 200, textAlign: 'center',
      font: '11px ui-monospace, monospace', lineHeight: 1.5,
      boxShadow: '0 0 12px rgba(255,128,0,0.35)',
    }}>
      <div style={{ color: 'var(--warn)', letterSpacing: 1 }}>
        ⚠ BOSS — {bearing(boss.offset.dx, boss.offset.dy)} {dist.toFixed(0)} tiles
      </div>
      <div style={{ color: 'var(--gold)' }}>{name}</div>
      {/* The stall is the thing the player needs explained, so explain it here rather
          than in a log line that scrolls. */}
      <div style={{ color: '#c0b090', fontSize: 10 }}>
        nothing else spawns until it falls
      </div>
      <div style={{
        marginTop: 3, height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{ width: `${hpPct * 100}%`, height: '100%', background: 'var(--danger)' }} />
      </div>
    </div>
  )
}
