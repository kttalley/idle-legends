import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { startGameLoop, stopGameLoop } from './engine/gameLoop'
import { CharacterCreate } from './components/game/CharacterCreate'
import { CharacterSelect } from './components/game/CharacterSelect'
import { CombatView } from './components/game/CombatView'
import { CharacterPanel } from './components/game/CharacterPanel'
import { InventoryPanel } from './components/game/InventoryPanel'
import { ZoneTrack } from './components/game/ZoneTrack'
import { HeroBar } from './components/game/HeroBar'
import { CombatLog } from './components/game/CombatLog'
import { ChatPanel } from './components/game/ChatPanel'
import { PlayerCard } from './components/game/PlayerCard'
import { WhisperWindow } from './components/game/WhisperWindow'
import { installViewportInsets } from './engine/viewportInsets'
import { useDismissable } from './components/ui/useDismissable'
import { QuestToast } from './components/game/QuestToast'
import { OfflineReportToast } from './components/game/OfflineReportToast'
import { slotStorage, getLastSlotId, setLastSlotId } from './store/saveSlots'
import type { SaveSlotMeta } from './store/saveSlots'
import { ZONES, ZONE_ORDER } from './data/zones'
import { SpriteIcon } from './components/ui/SpriteIcon'
import { formatGold } from './components/ui/GoldDisplay'

const SHOW_DEV_JUMP = new URLSearchParams(window.location.search).has('dev')

// ── One panel metaphor, both breakpoints ──────────────────────────────────────
//
// This used to be two independent state machines: `activePanel` (mobile drawers, closed
// with a ✕) and `collapsed` (desktop rails, folded with a ‹/›). They were never mutually
// exclusive, and `.rail-minimize` was not hidden below 900px, so a mobile drawer rendered
// BOTH controls — and because `.app-sidebar-left.collapsed` (0,2,0) outranks the mobile
// `.app-sidebar-left` rule (0,1,0), tapping ‹ inside a drawer applied `width: 34px` and
// hid the body. The result was a 34px strip of empty glass that was still "open": scrim
// up, dock button lit, content gone.
//
// Now there is one concept. A panel is EXTENDED or RETRACTED, it carries exactly one
// control (minimize, in its own head), and what "retracted" looks like is the only thing
// the breakpoint decides:
//
//   desktop — a 34px stub at the screen edge, with the restore arrow on it
//   mobile  — off-screen entirely; the dock button IS the restore control
//
// So minimize and close stop being different verbs. There is no ✕ anywhere.
type PanelId = 'hero' | 'log' | 'bag'
type PanelState = Record<PanelId, boolean>

const NARROW_QUERY = '(max-width: 899px)'
const isNarrow = () =>
  typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches

/**
 * Only the DEFAULT differs by width, not the model.
 *
 * On desktop the rails are furniture and start extended. On a phone they are overlays on
 * top of the world, so starting them extended would open the app with the game hidden
 * behind three panels.
 */
function defaultPanels(narrow: boolean): PanelState {
  return narrow
    ? { hero: false, log: false, bag: false }
    : { hero: true, log: true, bag: true }
}

export default function App() {
  const initialized  = useGameStore(s => s.initialized)
  const initGame     = useGameStore(s => s.initGame)
  const loadSlot     = useGameStore(s => s.loadSlot)
  const gold         = useGameStore(s => s.gold)
  const currentZone  = useGameStore(s => s.currentZone)
  const devJumpZone  = useGameStore(s => s.devJumpZone)

  const [panels, setPanels] = useState<PanelState>(() => defaultPanels(isNarrow()))
  const [logTab, setLogTab] = useState<'combat' | 'chat'>('chat')

  // Crossing the breakpoint re-seeds the defaults. Without this, rotating a tablet from
  // portrait to landscape carries the phone's "everything retracted" state into a desktop
  // layout that has no dock to reopen anything from — the panels would be unreachable.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = (e: MediaQueryListEvent) => setPanels(defaultPanels(e.matches))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Publish the iOS keyboard height as --kb-inset so fixed panels can ride above it.
  useEffect(installViewportInsets, [])

  // Publish the log panel's real height as --log-h.
  //
  // The left rail's max-height subtracts --log-h so the column stops where the chat
  // panel starts. That number was hand-kept in :root at 220px, matching a `height` set
  // in a different rule two hundred lines away — change one and the rail silently
  // mis-sizes, either overlapping the chat or leaving a band of dead space above it.
  // Measuring it means the coupling cannot drift. (Mobile ignores the variable: the rail
  // is a drawer capped against the dock there, and the log is a floating sheet.)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = logRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const publish = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) document.documentElement.style.setProperty('--log-h', `${Math.round(h)}px`)
    }
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    publish()
    return () => ro.disconnect()
  }, [initialized])
  const [slots, setSlots]   = useState<SaveSlotMeta[]>(() => slotStorage.list())
  // Show creation directly when there are no heroes yet; otherwise the select screen.
  const [creating, setCreating] = useState<boolean>(() => slotStorage.list().length === 0)

  // Boot resume — the fix for "the app spontaneously returns to character select".
  //
  // It was never a reset; it was a MISSING RESUME. Commit 11966fe (save slots) replaced
  // loadGame() with loadSlot(id) and deleted the `useEffect(() => loadGame(), [])` that
  // used to run on mount, without replacing it — leaving loadSlot reachable from exactly
  // one place in the app, a human clicking Continue. The save on disk was fine the whole
  // time; nothing ever went back for it. So any re-evaluation of the gameStore module
  // lands on a fresh defaultState() with no way back: in dev that is Vite's HMR (
  // gameStore is not a Fast Refresh boundary, so it re-executes in place and the app
  // blinks to the menu mid-session with nothing in the console), and in a shipped
  // WKWebView it is a memory-pressure reload dumping the player at the menu mid-run.
  //
  // The ref guards against StrictMode's double-mount, which would otherwise run the
  // offline-progress projection in loadSlot twice.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    const last = getLastSlotId()
    if (!last) return
    // A stale pointer (hero deleted on another tab) must not be retried forever.
    if (!loadSlot(last)) setLastSlotId(null)
  }, [loadSlot])

  /**
   * The only mutation. On a phone the panels are overlays stacked on one screen, so
   * extending one retracts the rest; on desktop they are columns that coexist.
   */
  const toggle = useCallback((id: PanelId) => {
    setPanels(cur => {
      const next = !cur[id]
      if (next && isNarrow()) return { ...defaultPanels(true), [id]: true }
      return { ...cur, [id]: next }
    })
  }, [])

  /** Retract everything. A no-op on desktop, where nothing is covering the world. */
  const close = useCallback(() => {
    setPanels(cur => (isNarrow() ? defaultPanels(true) : cur))
  }, [])

  // The drawers are menus and keep the same contract as every other surface — see
  // ui/useDismissable. Registering them on the shared stack rather than hanging a handler
  // on the scrim is what makes the nested case work: the wardrobe is PORTALLED out of the
  // drawer that raised it, so a press inside the modal is geometrically outside the
  // drawer, and a local handler would dismiss the drawer the moment you touched it.
  //
  // No focus trap. The dock sits below the scrim and stays tappable on purpose — a drawer
  // here is a panel you switch away from, not a modal that owns the screen.
  const heroDrawer = useRef<HTMLDivElement>(null)
  const bagDrawer = useRef<HTMLDivElement>(null)
  // Only relevant on a phone, where an extended panel is an overlay with a scrim. On
  // desktop the rails are columns and `close` is a no-op, so registering them is harmless.
  const narrow = isNarrow()
  const openDrawer = narrow && panels.hero ? heroDrawer
    : narrow && panels.bag ? bagDrawer
    : undefined
  useDismissable(openDrawer != null, close, { ref: openDrawer, closeOnOutside: true })
  // Chat is the exception, and deliberately so: it has no scrim, because this is an idle
  // game you watch and a scrim would grey out the world you are chatting about. Its
  // "outside" is the world itself, handled on `.app-world` below — tapping the HUD while
  // reading chat is using a control, not tapping away.
  useDismissable(narrow && panels.log, close)

  const refreshSlots = () => setSlots(slotStorage.list())

  // `panel-open` and `collapsed` are now strictly complementary — a panel always carries
  // exactly one of them, at every breakpoint. (Both class names are kept: the UI suites
  // key off `panel-open` as the "extended" marker, and `collapsed` already carries the
  // desktop stub styling.)
  const panelClass = (base: string, id: PanelId) =>
    `${base} rp-glass ${panels[id] ? 'panel-open' : 'collapsed'}`

  useEffect(() => {
    if (initialized) {
      startGameLoop()
    } else {
      stopGameLoop()
      // Back at the menu — resync the slot list and reset creation state.
      const list = slotStorage.list()
      setSlots(list)
      setCreating(list.length === 0)
    }
    return () => stopGameLoop()
  }, [initialized])

  if (!initialized) {
    if (creating) {
      return (
        <CharacterCreate
          onCreate={(cls, race, opts) => initGame(cls, race, opts)}
          onBack={slots.length > 0 ? () => setCreating(false) : undefined}
        />
      )
    }
    return (
      <CharacterSelect
        slots={slots}
        onContinue={(id) => loadSlot(id)}
        onCreate={() => setCreating(true)}
        onDelete={(id) => { slotStorage.delete(id); refreshSlots() }}
      />
    )
  }

  return (
    <div
      className="app-root"
      data-left-collapsed={String(!panels.hero)}
      data-right-collapsed={String(!panels.bag)}
    >
      {/* The world, full-bleed. Everything below floats on top of it. */}
      {/* Tapping the world dismisses the chat sheet. Chat is the one panel with no
          scrim — a scrim would grey out the world you are chatting about and swallow the
          action bar — so "tap outside to close" has to come from the world itself. The
          HUD is excluded: using an ability or opening the minimap while reading chat is
          not tapping away from it.

          The tap is NOT swallowed, so the hero still walks where you pointed. That is the
          same call the target card makes (see PlayerCard) and the MMO convention: you
          click away, your character goes there, and the thing you clicked away from
          closes behind you. */}
      <div
        className="app-world"
        onPointerDown={e => {
          if (!(isNarrow() && panels.log)) return
          if ((e.target as HTMLElement).closest('.hud-layer')) return
          close()
        }}
      >
        <CombatView />
      </div>

      <QuestToast />
      <OfflineReportToast />

      {/* ── Left: hero strip / character / zone track ──
          Three bands, not one scrolling stack. The hero strip and the zone track are
          navigation and stay pinned; only the character sheet — the section that grows
          without bound as talents and stats accumulate — scrolls. The zone track sits at
          the FOOT because it reads as the ground the hero is standing on, and because it
          is now short enough that the sheet above it no longer has to be folded away. */}
      <div ref={heroDrawer} className={panelClass('app-sidebar-left', 'hero')}>
        <div className="rail-head">
          <HeroBar />
          <button
            className="rail-minimize"
            onClick={() => toggle('hero')}
            title={panels.hero ? 'Minimize character panel' : 'Show character panel'}
            aria-label={panels.hero ? 'Minimize character panel' : 'Show character panel'}
            aria-expanded={panels.hero}
          >
            {panels.hero ? '‹' : '›'}
          </button>
        </div>
        <div className="rail-body">
          <CharacterPanel />
          {SHOW_DEV_JUMP && (
            <select
              value={currentZone}
              onChange={e => devJumpZone(e.target.value as typeof currentZone)}
              title="DEV: jump to biome"
              className="rp-button"
              style={{ fontSize: '0.55rem', padding: '2px 4px' }}
            >
              {ZONE_ORDER.map(z => (
                <option key={z} value={z}>{ZONES[z]?.name ?? z}</option>
              ))}
            </select>
          )}
        </div>
        <div className="rail-foot">
          {/* Ordering a journey finishes what the drawer was opened for, so on a phone the
              drawer gets out of the way and lets you watch it. `close()` is a no-op on
              desktop, where the rail is permanent and nothing was covering anything. */}
          <ZoneTrack onTravel={close} />
        </div>
      </div>
      {/* ── Right: inventory ── */}
      <div ref={bagDrawer} className={panelClass('app-sidebar-right', 'bag')}>
        <div className="rail-head">
          <button
            className="rail-minimize"
            onClick={() => toggle('bag')}
            title={panels.bag ? 'Minimize inventory' : 'Show inventory'}
            aria-label={panels.bag ? 'Minimize inventory' : 'Show inventory'}
            aria-expanded={panels.bag}
          >
            {panels.bag ? '›' : '‹'}
          </button>
        </div>
        <div className="rail-body">
          <InventoryPanel />
        </div>
      </div>

      {/* ── Combat log / zone chat ── */}
      {/* Two feeds share one slot: what happened TO you, and what the world is saying
          around you. The ladder briefly lived here as a third tab and was moved out — it is
          a section with its own sub-views, not a feed, and this slot is a feed. */}
      <div ref={logRef} className={`app-log rp-glass${panels.log ? ' panel-open' : ''}`}>
        <div className="app-log-tabs">
          <button
            className={`app-log-tab${logTab === 'combat' ? ' is-active' : ''}`}
            onClick={() => setLogTab('combat')}
          >COMBAT</button>
          <button
            className={`app-log-tab${logTab === 'chat' ? ' is-active' : ''}`}
            onClick={() => setLogTab('chat')}
          >CHAT</button>
        </div>
        <div className="app-log-content">
          {logTab === 'combat' ? <CombatLog /> : <ChatPanel />}
        </div>
      </div>

      {/* Target card for a tapped hero, and the whisper conversation it can open.
          Both are fixed overlays so they work identically at every breakpoint — in
          particular they do NOT depend on the mobile log sheet being open. */}
      <PlayerCard />
      <WhisperWindow />

      {/* ── Mobile dock ── */}
      <div className="app-dock rp-glass-strong">
        <button
          className={`app-dock-btn${panels.hero ? ' is-active' : ''}`}
          onClick={() => toggle('hero')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon emoji="⚔" size={18} /></span>
          <span>Hero</span>
        </button>
        <button
          className={`app-dock-btn${panels.log ? ' is-active' : ''}`}
          onClick={() => toggle('log')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon emoji="📜" size={18} /></span>
          <span>Log</span>
        </button>
        <button
          className={`app-dock-btn${panels.bag ? ' is-active' : ''}`}
          onClick={() => toggle('bag')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon ui="bag" size={18} /></span>
          {/* Gold rides the bag rather than occupying a bar across the top of the world:
              it belongs with the things you spend it on, and costs no vertical space. */}
          <span className="app-dock-gold">{formatGold(gold)}</span>
        </button>
      </div>

      {/* The hero and inventory drawers are full-height sheets that own the screen, so
          they get a dismissing scrim. CHAT deliberately does not: this is an idle game
          you watch, and the whole point of a living-world chat feed is reading it WHILE
          the world runs. A scrim there greys out the world you're chatting about and
          blocks the action bar, which on a phone is most of the interface. */}
      {/* Scrim only — it dims the world and blocks stray taps, but dismissal comes from
          the shared stack, which is the only thing that knows whether the drawer is still
          the frontmost surface. */}
      {/* Phone only — on desktop these are columns beside the world, not sheets over it. */}
      {narrow && (panels.hero || panels.bag) && <div className="app-backdrop" />}
    </div>
  )
}
