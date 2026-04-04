import React, { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { startGameLoop, stopGameLoop } from './engine/gameLoop'
import { ClassSelect } from './components/game/ClassSelect'
import { CombatView } from './components/game/CombatView'
import { CharacterPanel } from './components/game/CharacterPanel'
import { InventoryPanel } from './components/game/InventoryPanel'
import { ZoneSelector } from './components/game/ZoneSelector'
import { CombatLog } from './components/game/CombatLog'
import { GoldDisplay } from './components/ui/GoldDisplay'
import type { ClassType } from './data/types'

export default function App() {
  const { initialized, initGame, loadGame, resetGame, gold } = useGameStore()

  // On mount: try to load a saved game
  useEffect(() => {
    loadGame()
  }, [])

  // Start/stop game loop based on initialized state
  useEffect(() => {
    if (initialized) {
      startGameLoop()
    } else {
      stopGameLoop()
    }
    return () => stopGameLoop()
  }, [initialized])

  if (!initialized) {
    return <ClassSelect onSelect={(cls: ClassType) => initGame(cls)} />
  }

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: '100vh',
        maxWidth: 1400,
        margin: '0 auto',
        padding: '8px',
        gap: 8,
      }}
    >
      {/* Top bar */}
      <div
        className="wow-panel flex items-center justify-between px-3 py-1.5"
        style={{ flexShrink: 0 }}
      >
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
          className="wow-button"
          style={{ fontSize: '0.6rem' }}
          onClick={() => {
            if (confirm('Reset all progress? This cannot be undone.')) resetGame()
          }}
        >
          New Game
        </button>
      </div>

      {/* Main layout */}
      <div
        className="flex gap-2 flex-1"
        style={{ minHeight: 0 }}
      >
        {/* Left — Character + Zones */}
        <div
          className="flex flex-col gap-2"
          style={{ width: 220, flexShrink: 0 }}
        >
          <div style={{ flex: '0 0 auto' }}>
            <ZoneSelector />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CharacterPanel />
          </div>
        </div>

        {/* Center — Combat + Log */}
        <div className="flex flex-col gap-2 flex-1" style={{ minWidth: 0 }}>
          <div style={{ flex: '0 0 320px' }}>
            <CombatView />
          </div>
          <div style={{ flex: 1, minHeight: 120 }}>
            <CombatLog />
          </div>
        </div>

        {/* Right — Inventory */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <InventoryPanel />
        </div>
      </div>
    </div>
  )
}
