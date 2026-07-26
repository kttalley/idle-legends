import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * The one place a thing gets explained and acted on.
 *
 * Replaces two desktop-only affordances at once — the hover tooltip and the right-click
 * alternate action — with a surface that works identically under a finger and a mouse:
 * a bottom sheet on narrow screens, a centred card on wide ones. Actions are ordinary
 * labelled buttons, so nothing is hidden behind a gesture the player has to be told about.
 * ("Right-click to sell" was written in the inventory panel for a long time and no handler
 * was ever wired to it — nobody could have discovered a feature that did not exist.)
 *
 * Bottom-anchored on mobile on purpose: it is the reachable third of a phone screen, and
 * it does not sit under the thumb that opened it.
 *
 * Rendered through a PORTAL to <body>. The panels that raise a sheet (the inventory
 * drawer, the talent tree) sit in positioned, z-indexed containers, and a z-index inside
 * one of those cannot climb past a sibling with a higher z — the mobile dock was drawing
 * straight through the scrim until this moved out of that stacking context.
 */
export interface SheetAction {
  label: string
  onClick: () => void
  /** Visual weight. `danger` for anything that destroys or sells. */
  tone?: 'primary' | 'default' | 'danger'
  disabled?: boolean
  hint?: string
}

interface DetailSheetProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  actions?: SheetAction[]
}

const TONE: Record<string, React.CSSProperties> = {
  primary: { borderColor: '#c8a100', color: '#ffd700', background: 'rgba(90,70,0,0.45)' },
  default: {},
  danger:  { borderColor: '#8a3a2a', color: '#ff9a80', background: 'rgba(90,30,20,0.35)' },
}

export function DetailSheet({ open, onClose, title, children, actions = [] }: DetailSheetProps) {
  // Escape closes, matching every other dismissible surface on desktop.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet rp-glass-strong" role="dialog" aria-modal="true">
        <div className="sheet-grip" aria-hidden="true" />
        {title && <div className="sheet-title">{title}</div>}
        <div className="sheet-body">{children}</div>
        {actions.length > 0 && (
          <div className="sheet-actions">
            {actions.map(a => (
              <button
                key={a.label}
                className="rp-button sheet-action"
                onClick={() => { a.onClick(); onClose() }}
                disabled={a.disabled}
                title={a.hint}
                style={{ ...(TONE[a.tone ?? 'default'] ?? {}), opacity: a.disabled ? 0.4 : 1 }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <button className="rp-button sheet-close" onClick={onClose}>Close</button>
      </div>
    </>,
    document.body,
  )
}
