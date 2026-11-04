import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { SpriteIcon } from '../ui/SpriteIcon'
import { trackEvent } from '../../net/funnel'
import { OPEN_TALENTS_EVENT } from './CharacterPanel'
import { maybeRequestReview } from '../../engine/appReview'

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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.75rem' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: color ?? 'var(--parchment)', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

export function OfflineReportToast() {
  const report = useGameStore(s => s.lastOffline)
  const dismiss = useGameStore(s => s.dismissOfflineReport)
  const level = useGameStore(s => s.level)
  const talentPoints = useGameStore(s => s.talentPoints)

  if (!report) return null

  /**
   * Dismissing a *good* absence is the one earned moment to ask for a rating — see the
   * header of engine/appReview.ts for every gate that sits behind this call. It is
   * deliberately not awaited: the toast must close on the tap, and a store prompt is
   * never allowed to stand between a player and their game.
   */
  function onDismiss() {
    dismiss()
    void maybeRequestReview({ level, levelsGained: report!.levelsGained, gold: report!.gold })
  }

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
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
            {formatSpan(report.secondsElapsed)}
          </span>
        </div>

        {report.cappedAtHours !== null && (
          <div style={{ fontSize: '0.68rem', color: 'var(--gold-deep)', fontStyle: 'italic' }}>
            <SpriteIcon ui="warn" size={10} /> Counted the first {report.cappedAtHours} hours —
            that is as far ahead as your hero will range unsupervised.
          </div>
        )}

        {/* The banked extension actually being SPENT is the only proof the player gets that
            the gold went somewhere, so it is stated even though nothing went wrong. */}
        {report.watchSpent > 0 && (
          <div style={{ fontSize: '0.68rem', color: 'var(--gold-soft)', fontStyle: 'italic' }}>
            Drew {formatSpan(report.watchSpent)} from your banked watch
            {report.watchRemaining > 0
              ? ` — ${formatSpan(report.watchRemaining)} still in hand.`
              : ' — the bank is empty.'}
          </div>
        )}

        {/* Not an error, and it must not read as one: the hero out-grew the world you have
            opened for them. The fix is a door, not a purchase, so the line points at the
            door. */}
        {report.cappedByContent && (
          <div style={{ fontSize: '0.68rem', color: 'var(--warn)', fontStyle: 'italic' }}>
            <SpriteIcon ui="warn" size={10} /> Your hero has learned all these lands can
            teach — they stopped at level {report.contentCeiling}. Beat this region's boss and
            move on to keep growing.
          </div>
        )}

        {/* A gathering absence pays in stock, not in kills — and it is a different report,
            so it says so rather than printing four zeroes and a material. */}
        {report.gathered && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Row
              label={report.gathered.name}
              value={`+${report.gathered.qty.toLocaleString()}`}
              color="var(--success)"
            />
            <div style={{ fontSize: '0.68rem', color: '#7a6a4a', fontStyle: 'italic', marginTop: 2 }}>
              Worked the vein while you were gone. Unattended stock comes back Coarse —
              quality is what being there is for.
            </div>
          </div>
        )}

        {!report.gathered && (
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
        )}

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
            <div style={{ fontSize: '0.68rem', color: '#7a6a4a', fontStyle: 'italic', marginTop: 2 }}>
              A factor would have sold those at full price instead of for scrap.
            </div>
          )}
        </div>

        {/* A long absence can bank a dozen levels at once, and the points that come with
            them sat unspent: the players who got furthest in 1.3 came back to 17 and 18.
            This is the moment they are most worth pointing at. */}
        {talentPoints >= 3 && (
          <div style={{ fontSize: '0.72rem', color: '#ffd86b', marginTop: 2 }}>
            {talentPoints} talent points are waiting to be spent.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          {talentPoints >= 3 && (
            <button
              className="rp-button"
              onClick={() => { trackEvent('talent_nudge_tap'); onDismiss(); window.dispatchEvent(new Event(OPEN_TALENTS_EVENT)) }}
              style={{ fontSize: '0.75rem', padding: '3px 10px', background: 'linear-gradient(180deg, var(--wood-lit), #4a3518)' }}
            >
              Spend talent points
            </button>
          )}
          <button
            className="rp-button"
            onClick={onDismiss}
            style={{ fontSize: '0.75rem', padding: '3px 10px' }}
          >
            Good to be back
          </button>
        </div>
      </div>
    </div>
  )
}
