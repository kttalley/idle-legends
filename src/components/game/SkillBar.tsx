import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { getClassAbilities } from '../../data/abilities'
import type { ActiveAbilityDef } from '../../data/types'

interface SlotProps {
  ability: ActiveAbilityDef
  remaining: number
  onActivate: () => void
}

function SkillSlot({ ability, remaining, onActivate }: SlotProps) {
  const pct = remaining > 0 ? remaining / ability.cooldownSeconds : 0
  const onCd = remaining > 0

  return (
    <button
      title={`${ability.name}\n${ability.description}\nCooldown: ${ability.cooldownSeconds}s`}
      onClick={onActivate}
      disabled={onCd}
      style={{
        position: 'relative',
        width: 64,
        height: 64,
        background: onCd
          ? 'linear-gradient(180deg, #1a1508, #0d0b05)'
          : 'linear-gradient(180deg, #3a2c10, #1f1a08)',
        border: `2px solid ${onCd ? '#3a2c10' : '#c8a118'}`,
        borderRadius: 6,
        cursor: onCd ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: 4,
        transition: 'border-color 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* Conic-gradient cooldown sweep overlay */}
      {onCd && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 4,
            background: `conic-gradient(
              from -90deg,
              rgba(0,0,0,0.72) ${pct * 360}deg,
              transparent ${pct * 360}deg
            )`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Icon */}
      <span style={{ fontSize: '1.4rem', lineHeight: 1, zIndex: 1 }}>
        {ability.icon}
      </span>

      {/* Name (truncated) */}
      <span style={{
        fontSize: '0.5rem',
        color: onCd ? '#666' : '#d4b896',
        textAlign: 'center',
        lineHeight: 1.1,
        maxWidth: 56,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        zIndex: 1,
      }}>
        {ability.name}
      </span>

      {/* Cooldown timer */}
      {onCd && (
        <span style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '0.95rem',
          fontWeight: 700,
          color: '#fff',
          textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          zIndex: 2,
          pointerEvents: 'none',
        }}>
          {Math.ceil(remaining)}
        </span>
      )}
    </button>
  )
}

export function SkillBar() {
  const { playerClass, skillCooldowns, activateAbility, currentMob, isAlive } = useGameStore()
  const abilities = getClassAbilities(playerClass)

  if (abilities.length === 0) return null

  return (
    <div
      className="flex items-center justify-center gap-2 py-1"
      style={{
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid #2a1f08',
        borderBottom: '1px solid #2a1f08',
      }}
    >
      <span style={{
        fontSize: '0.55rem',
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginRight: 4,
        whiteSpace: 'nowrap',
      }}>
        Abilities
      </span>
      {abilities.map(ability => (
        <SkillSlot
          key={ability.id}
          ability={ability}
          remaining={skillCooldowns[ability.id] ?? 0}
          onActivate={() => isAlive && activateAbility(ability.id)}
        />
      ))}
    </div>
  )
}
