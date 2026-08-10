import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { SpriteIcon } from '../ui/SpriteIcon'

/**
 * "While you were away" — shown once on load when time away was granted.
 *
 * This is the moment that sells an idle game, so it itemises rather than just handing over
 * a number: what the hero killed, what the factor sold, what the bag could not hold. It is
 * also the only place a player can see their merchant contract earning its keep offline,
 * which is the thing the contract was always supposed to do.
 */
function formatSpan(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h <= 0) return `${m} minute${m === 1 ? '' : 's'}`
  if (m <= 0) return `${h} hour${h === 1 ? '' : 's'}`
  return `${h}h ${m}m`
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.6rem' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: color ?? 'var(--parchment)', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

export function OfflineReportToast() {
  const report = useGameStore(s => s.lastOffline)
  const dismiss = useGameStore(s => s.dismissOfflineReport)

  if (!report) return null

  return (
    <div
      style={{
        position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)',
        zIndex: 120, width: 'min(340px, 92vw)',
      }}
    >
      <div className="rp-panel" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)' }}>
            While you were away
          </span>
          <span style={{ fontSize: '0.55rem', color: 'var(--muted)' }}>
            {formatSpan(report.secondsElapsed)}
          </span>
        </div>

        {report.cappedAtHours !== null && (
          <div style={{ fontSize: '0.5rem', color: 'var(--gold-deep)', fontStyle: 'italic' }}>
            <SpriteIcon ui="warn" size={10} /> Counted the first {report.cappedAtHours} hours —
            that is as far ahead as your hero will range unsupervised.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Row label="Enemies felled" value={report.kills.toLocaleString()} />
          <Row label="Gold earned" value={`${report.gold.toLocaleString()}g`} color="var(--gold)" />
          <Row label="Experience" value={report.xp.toLocaleString()} />
          {report.levelsGained > 0 && (
            <Row
              label={report.levelsGained === 1 ? 'Level gained' : 'Levels gained'}
              value={`+${report.levelsGained}`}
              color="#00ff88"
            />
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {report.itemsEquipped > 0 && (
            <Row label="Upgrades worn" value={`${report.itemsEquipped}`} color="var(--success)" />
          )}
          {report.itemsBagged > 0 && (
            <Row label="Carried home" value={`${report.itemsBagged}`} />
          )}
          {report.itemsSold > 0 && (
            <Row
              label="Sold by your factor"
              value={`${report.itemsSold} · ${report.soldGold.toLocaleString()}g`}
              color="var(--success)"
            />
          )}
          {report.itemsSalvaged > 0 && (
            <Row
              label="Scrapped — no room"
              value={`${report.itemsSalvaged} · ${report.salvagedGold.toLocaleString()}g`}
              color="var(--gold-deep)"
            />
          )}
          {report.itemsSalvaged > 0 && report.itemsSold === 0 && (
            <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic', marginTop: 2 }}>
              A factor would have sold those at full price instead of for scrap.
            </div>
          )}
        </div>

        <button
          className="rp-button"
          onClick={dismiss}
          style={{ fontSize: '0.6rem', padding: '3px 10px', alignSelf: 'flex-start', marginTop: 2 }}
        >
          Good to be back
        </button>
      </div>
    </div>
  )
}
