import React, { useState, useRef, useCallback } from 'react'
import type { Item } from '../../data/types'
import { itemColor } from '../../store/gameStore'
import { UNIQUE_BY_ID } from '../../data/uniques'

// ── Item Tooltip ──────────────────────────────────────────────────────────────
interface ItemTooltipProps {
  item: Item
  equippedItem?: Item | null  // for stat comparison
  /** Suppress the name row when the surrounding surface already shows it (the detail
   *  sheet puts it in the title), so the item isn't announced twice. */
  hideName?: boolean
}

function statLabel(key: string): string {
  const map: Record<string, string> = {
    strength:           'Strength',
    intellect:          'Intellect',
    agility:            'Agility',
    stamina:            'Stamina',
    armor:              'Armor',
    weaponDps:          'Weapon DPS',
    critChance:         'Crit Chance',
    goldFindBonus:      'Gold Find',
    attackSpeedSeconds: 'Attack Speed',
  }
  return map[key] ?? key
}

function formatStat(key: string, val: number): string {
  if (key === 'critChance')         return `+${(val * 100).toFixed(1)}%`
  if (key === 'goldFindBonus')      return `${((val - 1) * 100).toFixed(0)}% bonus`
  if (key === 'attackSpeedSeconds') return val > 0 ? `+${val}s` : `${val}s`
  return val > 0 ? `+${val}` : String(val)
}

export function ItemTooltipContent({ item, equippedItem, hideName }: ItemTooltipProps) {
  const color = itemColor(item)
  const unique = item.uniqueId ? UNIQUE_BY_ID[item.uniqueId] : null

  return (
    <div className="rp-tooltip" style={{ fontSize: '0.7rem' }}>
      {!hideName && (
        <div style={{ color, fontWeight: 700, fontSize: '0.8rem', marginBottom: 4 }}>
          {item.name}
        </div>
      )}
      <div style={{ color: '#aaa', marginBottom: 2 }}>
        {item.slot.charAt(0).toUpperCase() + item.slot.slice(1)} • Level {item.level}
      </div>
      <div style={{ color, marginBottom: 6, textTransform: 'capitalize', fontSize: '0.65rem' }}>
        {item.rarity}
      </div>
      <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 4, marginBottom: 6 }}>
        {Object.entries(item.statBonuses).map(([key, val]) => {
          if (val === undefined || val === 0) return null
          const diff = equippedItem ? (val as number) - ((equippedItem.statBonuses as any)[key] ?? 0) : null
          const diffColor = diff === null ? 'var(--parchment)' : diff > 0 ? '#1eff00' : diff < 0 ? 'var(--danger)' : 'var(--parchment)'
          return (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 1 }}>
              <span style={{ color: 'var(--muted)' }}>{statLabel(key)}</span>
              <span style={{ color: diffColor }}>
                {formatStat(key, val as number)}
                {diff !== null && diff !== 0 && (
                  <span style={{ marginLeft: 4, fontSize: '0.6rem' }}>
                    ({diff > 0 ? '+' : ''}{formatStat(key, diff)})
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {/* The "Equip:" line — the reason a unique is worth having, and until now the one
          thing about it the player could not see. Green, under the stats, the way this
          genre has always written it. */}
      {unique && (
        <div style={{
          color: '#1eff00', fontSize: '0.65rem', lineHeight: 1.35,
          borderTop: '1px solid var(--edge)', paddingTop: 4, marginBottom: 6,
        }}>
          {unique.equipText}
        </div>
      )}
      <div style={{ color: 'var(--gold)', fontSize: '0.65rem' }}>
        {/* A unique has no price because nothing will buy it — the drop ladder, the
            factor and the Sell button all refuse. Saying so beats printing a number that
            is never paid. */}
        {item.protected ? 'Cannot be sold or salvaged' : `Sells for ${item.vendorValue}g`}
      </div>
    </div>
  )
}

// ── Tooltip Wrapper ───────────────────────────────────────────────────────────
interface TooltipWrapperProps {
  children: React.ReactNode
  content: React.ReactNode
}

export function TooltipWrapper({ children, content }: TooltipWrapperProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setPos({ x: e.clientX + 12, y: e.clientY - 8 })
  }, [])

  return (
    <div
      ref={ref}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onMouseMove={handleMouseMove}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {children}
      {visible && (
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
}
