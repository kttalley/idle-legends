import React from 'react'
import { createPortal } from 'react-dom'
import { blockPlayer } from '../../moderation/blocks'
import { fileReport, REPORT_REASONS, type ReportReason } from '../../moderation/reports'
import { useDismissable } from '../ui/useDismissable'

/**
 * Report or block a player.
 *
 * The two halves of App Review 1.2 that need a human interface: "a mechanism for users to
 * flag objectionable content" and "a mechanism for users to block abusive users". They are
 * one dialog because they are one moment — somebody has just seen a name they object to,
 * and making them find two separate controls for "tell someone" and "stop showing me this"
 * is how neither gets used.
 *
 * ── Why blocking is offered as the primary action ───────────────────────────
 * A report is a promise that someone will look within 24 hours. A block is relief NOW, and
 * it works offline. So "Block and report" is the leading button and takes both actions —
 * `blockPlayer` files the report itself, which is also exactly what the guideline's
 * parenthetical ("blocking should also notify the developer") asks for. Reporting without
 * blocking stays available underneath, for the player who wants the name gone from the
 * board but has no personal quarrel with its owner.
 */
export function ReportDialog({
  userId, name, surface = 'ladder', onClose,
}: {
  userId: string
  name: string
  surface?: 'ladder' | 'world'
  onClose: () => void
}) {
  const [reason, setReason] = React.useState<ReportReason>('hate_or_slur')
  const [done, setDone] = React.useState<'reported' | 'blocked' | null>(null)
  const surfaceRef = React.useRef<HTMLDivElement>(null)
  useDismissable(true, onClose, { ref: surfaceRef, closeOnOutside: true, trapFocus: true })

  function block() {
    blockPlayer(userId, name, reason)   // files the report too — see blocks.ts
    setDone('blocked')
  }

  function report() {
    void fileReport({ userId, name, reason, surface })
    // Confirmed unconditionally, and deliberately. `fileReport` can fail offline, but
    // telling someone who has just reported a slur "that didn't work" invites them to sit
    // there re-tapping it, and there is nothing useful they can do about it either way.
    setDone('reported')
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + var(--safe-t)) 16px calc(16px + var(--safe-b))',
      }}
    >
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Report or block ${name}`}
        className="rp-glass"
        style={{ width: 'min(340px, 92vw)', borderRadius: 12, padding: 14 }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--gold)' }}>
          {done ? 'Thank you' : 'Report this player'}
        </div>

        {done ? (
          <>
            <p style={{ fontSize: '0.6rem', color: 'var(--parchment)', lineHeight: 1.55, margin: '8px 0 12px' }}>
              {done === 'blocked'
                ? `${name} is blocked. They no longer appear on your leaderboard or in your world, and we have been notified. Reports are reviewed within 24 hours.`
                : `${name} has been reported. Reports are reviewed within 24 hours, and offending content is removed.`}
            </p>
            <button className="rp-button" onClick={onClose}
                    style={{ width: '100%', fontSize: '0.65rem', minHeight: 40 }}>
              Close
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.58rem', color: '#9a9086', lineHeight: 1.5, margin: '4px 0 10px' }}>
              What is wrong with <span style={{ color: 'var(--parchment)' }}>{name}</span>?
            </p>

            {/* A fixed set of reasons, not a text box — a free-text report body is itself
                user-generated content shown to a human, and would need moderating in turn. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
              {REPORT_REASONS.map(r => (
                <button
                  key={r.id}
                  className="rp-button"
                  onClick={() => setReason(r.id)}
                  aria-pressed={reason === r.id}
                  style={{
                    fontSize: '0.6rem', minHeight: 34, textAlign: 'left', padding: '6px 10px',
                    borderColor: reason === r.id ? 'var(--gold)' : undefined,
                    color: reason === r.id ? 'var(--gold-bright)' : undefined,
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="rp-button" onClick={block}
                      style={{ fontSize: '0.65rem', minHeight: 42, borderColor: 'var(--gold)' }}>
                Block and report
              </button>
              <button className="rp-button" onClick={report}
                      style={{ fontSize: '0.62rem', minHeight: 36 }}>
                Report only
              </button>
              <button className="rp-button" onClick={onClose}
                      style={{ fontSize: '0.62rem', minHeight: 36 }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
