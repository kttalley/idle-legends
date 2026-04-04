import React from 'react'

function formatGold(n: number): string {
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
      <span style={{ fontSize: 16 }}>🪙</span>
      <span style={{ color: '#ffd700', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
        {formatGold(gold)}
      </span>
    </div>
  )
}
