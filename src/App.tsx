import React, { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { startGameLoop, stopGameLoop } from './engine/gameLoop'
import { ClassSelect } from './components/game/ClassSelect'
import { CharacterSelect } from './components/game/CharacterSelect'
import { CombatView } from './components/game/CombatView'
import { CharacterPanel } from './components/game/CharacterPanel'
import { InventoryPanel } from './components/game/InventoryPanel'
import { ZoneSelector } from './components/game/ZoneSelector'
import { CombatLog } from './components/game/CombatLog'
import { GoldDisplay } from './components/ui/GoldDisplay'
import { slotStorage } from './store/saveSlots'
import type { SaveSlotMeta } from './store/saveSlots'
import type { ClassType, RaceType } from './data/types'

type MobilePanel = 'left' | 'right' | 'log' | null

export default function App() {
  const initialized  = useGameStore(s => s.initialized)
  const initGame     = useGameStore(s => s.initGame)
  const loadSlot     = useGameStore(s => s.loadSlot)
  const returnToMenu = useGameStore(s => s.returnToMenu)
  const gold         = useGameStore(s => s.gold)

  const [activePanel, setActivePanel] = useState<MobilePanel>(null)
  const [slots, setSlots]   = useState<SaveSlotMeta[]>(() => slotStorage.list())
  // Show creation directly when there are no heroes yet; otherwise the select screen.
  const [creating, setCreating] = useState<boolean>(() => slotStorage.list().length === 0)

  const toggle = (p: MobilePanel) => setActivePanel(cur => cur === p ? null : p)
  const close  = () => setActivePanel(null)

  const refreshSlots = () => setSlots(slotStorage.list())

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
        <ClassSelect
          onSelect={(cls: ClassType, race: RaceType) => initGame(cls, race)}
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
    <div className="app-root">
      {/* ── Top bar ── */}
      <div className="rp-panel flex items-center justify-between px-3 py-1.5" style={{ flexShrink: 0 }}>
        <div style={{
          fontFamily: 'Cinzel Decorative, Cinzel, serif',
          color: '#ffd700',
          fontSize: '0.9rem',
          textShadow: '0 0 8px rgba(200,161,0,0.4)',
          letterSpacing: '0.08em',
        }}>
          Idle Legends
        </div>
        <GoldDisplay gold={gold} />
        <button
          className="rp-button"
          style={{ fontSize: '0.6rem' }}
          onClick={returnToMenu}
        >
          Menu
        </button>
      </div>

      {/* ── Main body ── */}
      <div className="app-body">

        {/* Left: Zones + Character */}
        <div className={`app-sidebar-left${activePanel === 'left' ? ' panel-open' : ''}`}>
          <button className="app-drawer-close" onClick={close}>✕ close</button>
          <ZoneSelector />
          <CharacterPanel />
        </div>

        {/* Center: Combat + Log */}
        <div className="app-center">
          <CombatView />
          <div className={`app-log${activePanel === 'log' ? ' panel-open' : ''}`}>
            <CombatLog />
          </div>
        </div>

        {/* Right: Inventory */}
        <div className={`app-sidebar-right${activePanel === 'right' ? ' panel-open' : ''}`}>
          <button className="app-drawer-close" onClick={close}>✕ close</button>
          <InventoryPanel />
        </div>
      </div>

      {/* ── Mobile FABs ── */}
      <div className="app-fabs">
        <button className={`app-fab${activePanel === 'left' ? ' fab-active' : ''}`} onClick={() => toggle('left')}>
          <span className="app-fab-icon">⚔</span>
          <span>Character</span>
        </button>
        <button className={`app-fab${activePanel === 'log' ? ' fab-active' : ''}`} onClick={() => toggle('log')}>
          <span className="app-fab-icon">📜</span>
          <span>Log</span>
        </button>
        <button className={`app-fab${activePanel === 'right' ? ' fab-active' : ''}`} onClick={() => toggle('right')}>
          <span className="app-fab-icon">🎒</span>
          <span>Inv</span>
        </button>
      </div>

      {/* ── Backdrop (mobile only) ── */}
      {activePanel && <div className="app-backdrop" onClick={close} />}
    </div>
  )
}
