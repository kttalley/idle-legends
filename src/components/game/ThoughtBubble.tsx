import React, { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'

export function ThoughtBubble() {
  const { currentThought, thoughtExpiresAt } = useGameStore()
  const [visible, setVisible] = useState(false)
  const [displayed, setDisplayed] = useState<string | null>(null)

  useEffect(() => {
    if (currentThought) {
      setDisplayed(currentThought)
      setVisible(true)
    } else {
      // Fade out
      setVisible(false)
      const t = setTimeout(() => setDisplayed(null), 400)
      return () => clearTimeout(t)
    }
  }, [currentThought])

  if (!displayed) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: 6,
        width: 'max-content',
        maxWidth: 160,
        background: 'rgba(18, 14, 6, 0.92)',
        border: '1px solid #5a4020',
        borderRadius: 8,
        padding: '5px 8px',
        fontSize: '0.6rem',
        fontStyle: 'italic',
        color: '#d4b896',
        textAlign: 'center',
        lineHeight: 1.4,
        pointerEvents: 'none',
        zIndex: 20,
        whiteSpace: 'normal',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
        // Speech bubble tail pointing down
      }}
    >
      {displayed}
      {/* Tail */}
      <div style={{
        position: 'absolute',
        bottom: -6,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: '6px solid #5a4020',
      }} />
      <div style={{
        position: 'absolute',
        bottom: -4,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: '5px solid rgba(18,14,6,0.92)',
      }} />
    </div>
  )
}
