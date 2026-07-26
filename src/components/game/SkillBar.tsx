import React, { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { getClassAbilities } from '../../data/abilities'
import { SpriteIcon } from '../ui/SpriteIcon'
import { DetailSheet } from '../ui/DetailSheet'
import { useLongPress } from '../ui/useLongPress'
import type { ActiveAbilityDef } from '../../data/types'

interface SlotProps {
  ability: ActiveAbilityDef
  remaining: number
  onActivate: () => void
  onInspect: () => void
  compact?: boolean
}

function SkillSlot({ ability, remaining, onActivate, onInspect, compact }: SlotProps) {
  const pct = remaining > 0 ? remaining / ability.cooldownSeconds : 0
  const onCd = remaining > 0
  // 64px slots plus four mode toggles overflowed a 390px viewport, which is why the bar
  // was pressed against both edges. 56 still clears the touch minimum comfortably.
  const size = compact ? 56 : 64

  // Abilities are the one place tap CANNOT open an inspector: firing them is a combat
  // action and has to stay a single instant press. So the description — which used to
  // live only in a `title` attribute, i.e. nowhere at all on a phone — moves to
  // press-and-hold. The corner dot is there so the gesture is discoverable rather than
  // folklore.
  const press = useLongPress(onInspect, () => { if (!onCd) onActivate() })

  return (
    <button
      title={`${ability.name}\n${ability.description}\nCooldown: ${ability.cooldownSeconds}s — hold to inspect`}
      {...press}
      aria-label={`${ability.name}. Hold to inspect.`}
      disabled={onCd}
      style={{
        position: 'relative',
        width: size,
        height: size,
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
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
      }}
    >
      {/* Hold hint — small enough to ignore, present enough to invite the gesture. */}
      <span style={{
        position: 'absolute', top: 3, right: 4, width: 3, height: 3, borderRadius: 2,
        background: onCd ? '#4a4030' : '#c8a864', opacity: 0.8, zIndex: 2,
      }} />
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

      {/* Icon — pixel sprite (falls back to the emoji glyph if unmapped) */}
      <span style={{ zIndex: 1, opacity: onCd ? 0.5 : 1 }}>
        <SpriteIcon emoji={ability.icon} size={compact ? 22 : 26} />
      </span>

      {/* Name (truncated) */}
      <span style={{
        fontSize: compact ? '0.45rem' : '0.5rem',
        color: onCd ? '#666' : '#d4b896',
        textAlign: 'center',
        lineHeight: 1.1,
        maxWidth: size - 8,
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

export function SkillBar({ embedded = false, compact = false }:
  { embedded?: boolean; compact?: boolean } = {}) {
  const { playerClass, skillCooldowns, activateAbility, currentMob, isAlive } = useGameStore()
  const abilities = getClassAbilities(playerClass)
  const [inspected, setInspected] = useState<ActiveAbilityDef | null>(null)

  const sheet = (
    <DetailSheet
      open={!!inspected}
      onClose={() => setInspected(null)}
      title={inspected?.name}
      actions={inspected ? [{
        label: 'Use',
        tone: 'primary',
        onClick: () => activateAbility(inspected.id),
        disabled: !isAlive || (skillCooldowns[inspected.id] ?? 0) > 0,
        hint: (skillCooldowns[inspected.id] ?? 0) > 0 ? 'Still on cooldown' : undefined,
      }] : undefined}
    >
      {inspected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SpriteIcon emoji={inspected.icon} size={28} />
            <span style={{ color: '#9d9d9d' }}>Cooldown {inspected.cooldownSeconds}s
              {inspected.castTimeSeconds ? ` · ${inspected.castTimeSeconds}s cast` : ''}</span>
          </div>
          <div>{inspected.description}</div>
        </div>
      )}
    </DetailSheet>
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if focus is on an input/textarea to avoid blocking text entry
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '1' && abilities[0]) activateAbility(abilities[0].id)
      if (e.key === '2' && abilities[1]) activateAbility(abilities[1].id)
      if (e.key === '3' && abilities[2]) activateAbility(abilities[2].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [abilities, activateAbility])

  if (abilities.length === 0) return null

  // Embedded (inside the HUD ActionBar): no fixed positioning, no background strip —
  // the ActionBar owns the panel. Standalone: the legacy fixed bottom strip.
  if (embedded) {
    return (
      <div className="flex items-center justify-center" style={{ gap: compact ? 5 : 8 }}>
        {abilities.map(ability => (
          <SkillSlot
            key={ability.id}
            ability={ability}
            remaining={skillCooldowns[ability.id] ?? 0}
            onActivate={() => isAlive && activateAbility(ability.id)}
            onInspect={() => setInspected(ability)}
            compact={compact}
          />
        ))}
        {sheet}
      </div>
    )
  }

  return (
    <div
      className="skill-bar flex items-center justify-center gap-2 py-1"
      style={{
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid #2a1f08',
        borderBottom: '1px solid #2a1f08',
        flexShrink: 0,
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
          onInspect={() => setInspected(ability)}
        />
      ))}
      {sheet}
    </div>
  )
}
