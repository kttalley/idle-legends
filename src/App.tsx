import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { startGameLoop, stopGameLoop } from './engine/gameLoop'
import { CharacterCreate } from './components/game/CharacterCreate'
import { CharacterSelect } from './components/game/CharacterSelect'
import { CombatView } from './components/game/CombatView'
import { CharacterPanel } from './components/game/CharacterPanel'
import { InventoryPanel } from './components/game/InventoryPanel'
import { ZoneSelector } from './components/game/ZoneSelector'
import { CombatLog } from './components/game/CombatLog'
import { ChatPanel } from './components/game/ChatPanel'
import { PlayerCard } from './components/game/PlayerCard'
import { WhisperWindow } from './components/game/WhisperWindow'
import { installViewportInsets } from './engine/viewportInsets'
import { QuestToast } from './components/game/QuestToast'
import { OfflineReportToast } from './components/game/OfflineReportToast'
import { slotStorage, getLastSlotId, setLastSlotId } from './store/saveSlots'
import type { SaveSlotMeta } from './store/saveSlots'
import { ZONES, ZONE_ORDER } from './data/zones'
import { SpriteIcon } from './components/ui/SpriteIcon'

const SHOW_DEV_JUMP = new URLSearchParams(window.location.search).has('dev')

/** Compact gold for the dock chip — 1.2K / 46.7K / 3.4M. */
function formatGold(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

type MobilePanel = 'left' | 'right' | 'log' | null

export default function App() {
  const initialized  = useGameStore(s => s.initialized)
  const initGame     = useGameStore(s => s.initGame)
  const loadSlot     = useGameStore(s => s.loadSlot)
  const gold         = useGameStore(s => s.gold)
  const currentZone  = useGameStore(s => s.currentZone)
  const devJumpZone  = useGameStore(s => s.devJumpZone)

  const [activePanel, setActivePanel] = useState<MobilePanel>(null)
  // Desktop-only: fold a glass column off the world. Mobile uses `activePanel`
  // drawers instead, and the CSS neutralises `collapsed` there.
  const [collapsed, setCollapsed] = useState({ left: false, right: false })
  const [logTab, setLogTab] = useState<'combat' | 'chat'>('chat')

  // Publish the iOS keyboard height as --kb-inset so fixed panels can ride above it.
  useEffect(installViewportInsets, [])
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

  const toggle = (p: MobilePanel) => setActivePanel(cur => cur === p ? null : p)
  const close  = () => setActivePanel(null)

  const refreshSlots = () => setSlots(slotStorage.list())

  const leftClass = ['app-sidebar-left rp-glass',
    collapsed.left ? 'collapsed' : '',
    activePanel === 'left' ? 'panel-open' : ''].filter(Boolean).join(' ')
  const rightClass = ['app-sidebar-right rp-glass',
    collapsed.right ? 'collapsed' : '',
    activePanel === 'right' ? 'panel-open' : ''].filter(Boolean).join(' ')

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
      data-left-collapsed={String(collapsed.left)}
      data-right-collapsed={String(collapsed.right)}
    >
      {/* The world, full-bleed. Everything below floats on top of it. */}
      <div className="app-world">
        <CombatView />
      </div>

      <QuestToast />
      <OfflineReportToast />

      {/* ── Left: zones + character ── */}
      <div className={leftClass}>
        <button className="app-drawer-close" onClick={close} aria-label="Close">✕</button>
        <ZoneSelector />
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
      <button
        className="app-collapse-tab left rp-glass"
        onClick={() => setCollapsed(c => ({ ...c, left: !c.left }))}
        title={collapsed.left ? 'Show character panel' : 'Hide character panel'}
        aria-label={collapsed.left ? 'Show character panel' : 'Hide character panel'}
      >
        {collapsed.left ? '›' : '‹'}
      </button>

      {/* ── Right: inventory ── */}
      <div className={rightClass}>
        <button className="app-drawer-close" onClick={close} aria-label="Close">✕</button>
        <InventoryPanel />
      </div>
      <button
        className="app-collapse-tab right rp-glass"
        onClick={() => setCollapsed(c => ({ ...c, right: !c.right }))}
        title={collapsed.right ? 'Show inventory' : 'Hide inventory'}
        aria-label={collapsed.right ? 'Show inventory' : 'Hide inventory'}
      >
        {collapsed.right ? '‹' : '›'}
      </button>

      {/* ── Combat log / zone chat ── */}
      {/* Two feeds share one slot: what happened TO you, and what the world is saying
          around you. Tabs rather than a new layout region, so the mobile dock and the
          collapse tabs keep working unchanged. */}
      <div className={`app-log rp-glass${activePanel === 'log' ? ' panel-open' : ''}`}>
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
          className={`app-dock-btn${activePanel === 'left' ? ' is-active' : ''}`}
          onClick={() => toggle('left')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon emoji="⚔" size={18} /></span>
          <span>Hero</span>
        </button>
        <button
          className={`app-dock-btn${activePanel === 'log' ? ' is-active' : ''}`}
          onClick={() => toggle('log')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon emoji="📜" size={18} /></span>
          <span>Log</span>
        </button>
        <button
          className={`app-dock-btn${activePanel === 'right' ? ' is-active' : ''}`}
          onClick={() => toggle('right')}
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
      {activePanel && activePanel !== 'log' && <div className="app-backdrop" onClick={close} />}
    </div>
  )
}
