import React from 'react'
import { HeroAvatar } from '../sprites/HeroAvatar'
import type { ClassType, RaceType, FactionType, Rarity } from '../../data/types'

interface HeroPreviewProps {
  playerClass: ClassType
  race:        RaceType
  faction:     FactionType
  name?:       string
  rarity?:     Rarity
  /** CSS pixel size of the square preview. */
  size?:       number
}

// The creation preview now uses the same FFTA roster logic as the in-world hero,
// so what you build is exactly what you play. It is a thin wrapper around HeroAvatar
// with the larger creation-screen frame.
export function HeroPreview({
  playerClass,
  race,
  faction,
  name = '',
  rarity = 'common',
  size = 168,
}: HeroPreviewProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: 'radial-gradient(ellipse at 50% 40%, #26324a 0%, #141a26 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,215,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <HeroAvatar
        race={race}
        playerClass={playerClass}
        name={name}
        faction={faction}
        rarity={rarity}
        size={size - 8}
        animate
        facing="se"
        circle={false}
      />
    </div>
  )
}
