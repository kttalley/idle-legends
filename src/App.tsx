import React, { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { startGameLoop, stopGameLoop } from './engine/gameLoop'
import { ClassSelect } from './components/game/ClassSelect'
import { CombatView } from './components/game/CombatView'
import { CharacterPanel } from './components/game/CharacterPanel'
import { InventoryPanel } from './components/game/InventoryPanel'
import { ZoneSelector } from './components/game/ZoneSelector'
import { CombatLog } from './components/game/CombatLog'
import { GoldDisplay } from './components/ui/GoldDisplay'
import type { ClassType, RaceType } from './data/types'

type MobilePanel = 'left' | 'right' | 'log' | null

export default function App() {
  const { initialized, initGame, loadGame, resetGame, gold } = useGameStore()
  const [activePanel, setActivePanel] = useState<MobilePanel>(null)

  const toggle = (p: MobilePanel) => setActivePanel(cur => cur === p ? null : p)
  const close  = () => setActivePanel(null)

  useEffect(() => { loadGame() }, [])

  useEffect(() => {
    if (initialized) startGameLoop()
    else stopGameLoop()
    return () => stopGameLoop()
  }, [initialized])

  if (!initialized) {
    return <ClassSelect onSelect={(cls: ClassType, race: RaceType) => initGame(cls, race)} />
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
          onClick={() => { if (confirm('Reset all progress? This cannot be undone.')) resetGame() }}
        >
          New Game
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
