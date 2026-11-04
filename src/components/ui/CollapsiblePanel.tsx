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

// Values are `boolean` for a standalone panel and `string | null` for a group key (the id
// of the one open member, or null for all closed) — see `groupKey`.
type Stored = Record<string, boolean | string | null>

function loadCollapsed(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) as Stored : {}
  } catch {
    return {}
  }
}

// Same-document notifier.
//
// The `storage` event only fires in OTHER tabs, so the cross-instance sync below never
// actually reached a sibling in the same document — which did not matter while every panel
// was independent, and matters entirely now that a group's members have to react to each
// other opening. Panels subscribe here and re-read on every write.
const listeners = new Set<(s: Stored) => void>()

function saveCollapsed(state: Stored): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* private mode */ }
  for (const fn of listeners) fn(state)
}

/**
 * Group membership is stored as WHICH ID IS OPEN, not as a boolean per panel.
 *
 * The obvious version — keep the booleans and have the opener close its siblings — has a
 * state for "two members open" that the rules merely promise never to produce, and any
 * path that misses the promise (a stale localStorage from before the group existed, two
 * rails mounted at once, a future third member) silently produces it. One slot cannot
 * represent two open panels at all, so the invariant holds without being enforced.
 */
const groupKey = (group: string) => `__group:${group}`

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
  /**
   * Accordion group. At most one panel per group is open at a time — opening one folds the
   * rest. Use when the members share a column too short to show two of them at once.
   * Exactly one member should declare `defaultCollapsed={false}`; it is the one that opens
   * on a first visit.
   */
  group?: string
  /** Grow to fill leftover space when open (the main panel in a column). */
  grow?: boolean
  children: React.ReactNode
}

/** Open a panel from outside it (e.g. a prompt that leads into the talent tree). In a
 *  group this claims the slot, which folds the sibling exactly as a header tap would. */
export function expandPanel(id: string, group?: string): void {
  const stored = loadCollapsed()
  saveCollapsed(group ? { ...stored, [groupKey(group)]: id } : { ...stored, [id]: false })
}

export function CollapsiblePanel({
  id, title, headerRight, defaultCollapsed = false, group, grow = false, children,
}: CollapsiblePanelProps) {
  /** Read this panel's collapsed state out of a stored snapshot. */
  const readCollapsed = useCallback((s: Stored): boolean => {
    if (group) {
      const key = groupKey(group)
      // No choice recorded yet — fall back to whichever member declared itself the default.
      if (!(key in s)) return defaultCollapsed
      return s[key] !== id
    }
    return id in s ? !!s[id] : defaultCollapsed
  }, [id, group, defaultCollapsed])

  // A group remembers WHICH member is open, and `null` — everything folded — is a state the
  // rail can be put into but should not START in: a rail that loads showing nothing but two
  // headers reads as broken, and the state survives forever once written, because no member
  // can claim a slot it is not open to claim. So an all-folded group falls back to whichever
  // member declared itself the default on load, while runtime toggles (which go through
  // `readCollapsed` via the listener) still fold everything as asked.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = loadCollapsed()
    if (group && stored[groupKey(group)] === null) return defaultCollapsed
    return readCollapsed(stored)
  })

  // Keep sections in sync when anything else writes: a sibling in the same group folding
  // this one, or the same id toggled by another mounted instance (the mobile drawer and the
  // desktop rail can both be alive at once). `storage` covers other tabs; `listeners`
  // covers this document, which the storage event does not.
  useEffect(() => {
    const apply = (s: Stored) => setCollapsed(readCollapsed(s))
    const onStorage = (e: StorageEvent) => { if (e.key === STORE_KEY) apply(loadCollapsed()) }
    listeners.add(apply)
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(apply)
      window.removeEventListener('storage', onStorage)
    }
  }, [readCollapsed])

  const toggle = useCallback(() => {
    const stored = loadCollapsed()
    const nowCollapsed = !readCollapsed(stored)
    // In a group, opening means claiming the slot and closing means vacating it — which is
    // what folds the sibling, without this panel needing to know who the sibling is.
    saveCollapsed(group
      ? { ...stored, [groupKey(group)]: nowCollapsed ? null : id }
      : { ...stored, [id]: nowCollapsed })
  }, [id, group, readCollapsed])

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
