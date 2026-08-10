import React from 'react'
import { SpriteIcon } from './SpriteIcon'

/**
 * Compact gold — 1.2K / 46.7K / 3.4M.
 *
 * Exported because the mobile dock's bag chip needs the identical rule: it had its own
 * copy in App.tsx that differed by a `Math.floor`, so the same purse could read 46 in one
 * place and 46.4 in the other.
 */
export function formatGold(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.floor(n))
}

interface GoldDisplayProps {
  gold: number
}

export function GoldDisplay({ gold }: GoldDisplayProps) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <SpriteIcon ui="coin" size={16} title="Gold" />
      <span style={{ color: 'var(--gold)', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
        {formatGold(gold)}
      </span>
    </div>
  )
}
