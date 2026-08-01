import React, { useCallback, useEffect, useState } from 'react'

// A sidebar section whose header collapses it.
//
// The rails stack several panels in one scrolling column, and the tall ones simply won a
// fight nobody was refereeing: the character sheet asked for full height and squeezed
// Zones down to a single clipped row, which made the zone list unusable. Rather than
// hand-tune heights per panel — which breaks again the moment a panel gains a row — every
// section can now be folded away by its own header, so the player decides what gets the
// space.
//
// The open/closed state persists, because a collapse you have to redo on every reload is
// worse than no collapse at all.

const STORE_KEY = 'idle_legends_panel_collapsed_v1'

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) as Record<string, boolean> : {}
  } catch {
    return {}
  }
}

function saveCollapsed(state: Record<string, boolean>): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* private mode */ }
}

export interface CollapsiblePanelProps {
  /** Stable key for persistence. Changing it resets that section's remembered state. */
  id: string
  /** Header content. A plain string gets the standard treatment; a node is rendered as-is. */
  title: React.ReactNode
  /** Rendered at the right edge of the header, and does NOT toggle when clicked —
   *  for controls like a tab count or an action button that live in the header. */
  headerRight?: React.ReactNode
  /** Start collapsed the first time this section is ever seen. */
  defaultCollapsed?: boolean
  /** Grow to fill leftover space when open (the main panel in a column). */
  grow?: boolean
  children: React.ReactNode
}

export function CollapsiblePanel({
  id, title, headerRight, defaultCollapsed = false, grow = false, children,
}: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const s = loadCollapsed()
    return id in s ? s[id] : defaultCollapsed
  })

  // Keep sections in sync if another instance toggles the same id (mobile + desktop
  // rails can both be mounted at once).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORE_KEY) return
      const s = loadCollapsed()
      if (id in s) setCollapsed(s[id])
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [id])

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      saveCollapsed({ ...loadCollapsed(), [id]: next })
      return next
    })
  }, [id])

  return (
    <div
      className={`rp-panel collapsible${collapsed ? ' is-collapsed' : ''}`}
      style={{
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        // Collapsed sections must not grow, or an open neighbour gets no space back.
        flex: collapsed ? '0 0 auto' : (grow ? '1 1 auto' : '0 1 auto'),
      }}
    >
      <div className="rp-panel-header collapsible-header">
        <button
          type="button"
          className="collapsible-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className={`collapsible-chevron${collapsed ? ' is-collapsed' : ''}`} aria-hidden>▾</span>
          <span className="collapsible-title">{title}</span>
        </button>
        {headerRight && <div className="collapsible-header-right">{headerRight}</div>}
      </div>
      {!collapsed && (
        <div className="collapsible-body" style={{ minHeight: 0, display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
          {children}
        </div>
      )}
    </div>
  )
}
