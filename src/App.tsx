import React, { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { startGameLoop, stopGameLoop } from './engine/gameLoop'
import { CharacterCreate } from './components/game/CharacterCreate'
import { CharacterSelect } from './components/game/CharacterSelect'
import { CombatView } from './components/game/CombatView'
import { CharacterPanel } from './components/game/CharacterPanel'
import { InventoryPanel } from './components/game/InventoryPanel'
import { ZoneSelector } from './components/game/ZoneSelector'
import { CombatLog } from './components/game/CombatLog'
import { GoldDisplay } from './components/ui/GoldDisplay'
import { QuestToast } from './components/game/QuestToast'
import { OfflineReportToast } from './components/game/OfflineReportToast'
import { slotStorage } from './store/saveSlots'
import type { SaveSlotMeta } from './store/saveSlots'
import { ZONES, ZONE_ORDER } from './data/zones'
import { SpriteIcon } from './components/ui/SpriteIcon'

const SHOW_DEV_JUMP = new URLSearchParams(window.location.search).has('dev')

type MobilePanel = 'left' | 'right' | 'log' | null

export default function App() {
  const initialized  = useGameStore(s => s.initialized)
  const initGame     = useGameStore(s => s.initGame)
  const loadSlot     = useGameStore(s => s.loadSlot)
  const returnToMenu = useGameStore(s => s.returnToMenu)
  const gold         = useGameStore(s => s.gold)
  const currentZone  = useGameStore(s => s.currentZone)
  const devJumpZone  = useGameStore(s => s.devJumpZone)

  const [activePanel, setActivePanel] = useState<MobilePanel>(null)
  // Desktop-only: fold a glass column off the world. Mobile uses `activePanel`
  // drawers instead, and the CSS neutralises `collapsed` there.
  const [collapsed, setCollapsed] = useState({ left: false, right: false })
  const [slots, setSlots]   = useState<SaveSlotMeta[]>(() => slotStorage.list())
  // Show creation directly when there are no heroes yet; otherwise the select screen.
  const [creating, setCreating] = useState<boolean>(() => slotStorage.list().length === 0)

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

      {/* ── Floating top bar ── */}
      <div className="app-topbar rp-glass">
        <div style={{
          fontFamily: 'Cinzel Decorative, Cinzel, serif',
          color: '#ffd700',
          fontSize: '0.85rem',
          textShadow: '0 0 8px rgba(200,161,0,0.4)',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}>
          Idle Legends
        </div>
        <GoldDisplay gold={gold} />
        <div className="flex items-center gap-2">
          {SHOW_DEV_JUMP && (
            <select
              value={currentZone}
              onChange={e => devJumpZone(e.target.value as typeof currentZone)}
              title="DEV: jump to biome"
              className="rp-button"
              style={{ fontSize: '0.55rem', padding: '2px 4px', maxWidth: 120 }}
            >
              {ZONE_ORDER.map(z => (
                <option key={z} value={z}>{ZONES[z]?.name ?? z}</option>
              ))}
            </select>
          )}
          <button className="rp-button" style={{ fontSize: '0.6rem' }} onClick={returnToMenu}>
            Menu
          </button>
        </div>
      </div>

      {/* ── Left: zones + character ── */}
      <div className={leftClass}>
        <button className="app-drawer-close" onClick={close} aria-label="Close">✕</button>
        <ZoneSelector />
        <CharacterPanel />
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

      {/* ── Combat log ── */}
      <div className={`app-log rp-glass${activePanel === 'log' ? ' panel-open' : ''}`}>
        <CombatLog />
      </div>

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
          <span>Bag</span>
        </button>
      </div>

      {activePanel && <div className="app-backdrop" onClick={close} />}
    </div>
  )
}
