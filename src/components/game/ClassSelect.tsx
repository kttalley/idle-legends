import React, { useState } from 'react'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { SpriteRenderer } from '../sprites/SpriteRenderer'
import type { ClassType } from '../../data/types'

interface ClassSelectProps {
  onSelect: (cls: ClassType) => void
}

export function ClassSelect({ onSelect }: ClassSelectProps) {
  const [hovered, setHovered] = useState<ClassType | null>(null)
  const classes = Object.values(CLASS_DEFINITIONS)

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{ background: 'radial-gradient(ellipse at center, #1e1a10 0%, #0d0b05 100%)' }}
    >
      {/* Title */}
      <div className="mb-8 text-center">
        <h1 style={{
          fontFamily: 'Cinzel Decorative, Cinzel, serif',
          fontSize: 'clamp(1.8rem, 5vw, 3rem)',
          color: '#ffd700',
          textShadow: '0 0 20px rgba(200,161,0,0.5), 0 2px 4px rgba(0,0,0,0.9)',
          letterSpacing: '0.1em',
          marginBottom: 4,
        }}>
          Idle Legends
        </h1>
        <p style={{ color: '#9d9d9d', fontSize: '0.8rem', letterSpacing: '0.15em' }}>
          CHOOSE YOUR CHAMPION
        </p>
      </div>

      {/* Class cards */}
      <div className="flex gap-6 flex-wrap justify-center px-4">
        {classes.map(cls => (
          <div
            key={cls.id}
            className="wow-panel cursor-pointer"
            style={{
              width: 180,
              padding: 16,
              textAlign: 'center',
              transition: 'all 0.15s',
              transform: hovered === cls.id ? 'translateY(-4px)' : undefined,
              borderColor: hovered === cls.id ? '#ffd700' : undefined,
            }}
            onMouseEnter={() => setHovered(cls.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect(cls.id)}
          >
            <div className="flex justify-center mb-3">
              <SpriteRenderer
                spriteKey={`player_${cls.id}`}
                label={cls.name}
                width={64}
                height={64}
                scale={1.5}
              />
            </div>
            <div className={`text-lg font-bold mb-1 ${cls.colorClass}`} style={{ fontFamily: 'Cinzel, serif' }}>
              {cls.name}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#9d9d9d', lineHeight: 1.4, marginBottom: 8 }}>
              {cls.description}
            </div>
            <div style={{ fontSize: '0.6rem', borderTop: '1px solid #3a2c10', paddingTop: 6 }}>
              <div className="flex justify-between">
                <span style={{ color: '#666' }}>Primary</span>
                <span style={{ color: '#d4b896', textTransform: 'capitalize' }}>{cls.primaryStat}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span style={{ color: '#666' }}>DPS</span>
                <span style={{ color: '#d4b896' }}>{cls.baseStats.weaponDps}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span style={{ color: '#666' }}>Atk Speed</span>
                <span style={{ color: '#d4b896' }}>{cls.baseStats.attackSpeedSeconds}s</span>
              </div>
            </div>
            <button
              className="wow-button w-full mt-3"
              style={{ background: hovered === cls.id ? 'linear-gradient(180deg, #6a5228, #4a3518)' : undefined }}
            >
              Play {cls.name}
            </button>
          </div>
        ))}
      </div>

      <p style={{ color: '#555', fontSize: '0.65rem', marginTop: 32 }}>
        Your progress is saved automatically.
      </p>
    </div>
  )
}
