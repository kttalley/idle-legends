import { CollapsiblePanel } from '../ui/CollapsiblePanel'
import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { xpForLevel } from '../../engine/progression'
import { GoldDisplay } from '../ui/GoldDisplay'
import { HealthBar } from '../ui/HealthBar'
import { TalentTree } from './TalentTree'

type Tab = 'stats' | 'talents'

export function CharacterPanel() {
  const {
    stats, level, xp, playerClass, gold, talentPoints, playerName, nameGenStatus,
    returnToMenu,
  } = useGameStore()
  const classDef = CLASS_DEFINITIONS[playerClass]
  const xpNeeded = xpForLevel(level)
  const [tab, setTab] = useState<Tab>('stats')

  return (
    // `grow` rather than `h-full`: asking for 100% height made this panel claim the whole
    // rail and squeeze Zones down to a single clipped row. Growing into leftover space
    // shares the column instead of taking it.
    <CollapsiblePanel
      id="character"
      grow
      title={
        // Stacked, not inline: side by side with the gold chip and the Heroes button the
        // hero's name had almost no width left and wrapped mid-word ("Rogue Z… the
        // Vengeful"). A long generated name is the norm here, not the exception.
        <span style={{ display: 'block', minWidth: 0 }}>
          <span className={classDef.colorClass}>{classDef.name}</span>
          {playerName && (
            <span style={{
              display: 'block', fontSize: '0.55rem', color: '#d4b896', fontStyle: 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {playerName}
            </span>
          )}
          {nameGenStatus === 'loading' && (
            <span style={{ display: 'block', fontSize: '0.5rem', color: '#666' }}>Naming…</span>
          )}
        </span>
      }
      headerRight={
        <>
          <GoldDisplay gold={gold} />
          {/* Was in a floating top bar that spanned the screen for the sake of two
              controls. Gold already lived here; switching hero belongs with the hero. */}
          {/* Ejects the player out of their run, so it confirms first and is big enough
              to be aimed at. At 0.55rem/2px it was a ~14px target sitting beside the gold
              chip — one mis-tap ended the session — while the rest of the social UI was
              raised to a 44pt minimum in the mobile pass. */}
          <button
            className="rp-button"
            onClick={() => {
              if (confirm('Return to character select?\n\nYour progress is saved.')) returnToMenu()
            }}
            title="Save and return to character select"
            style={{ fontSize: '0.62rem', padding: '8px 12px', minHeight: 34 }}
          >
            Heroes
          </button>
        </>
      }
    >

      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: '#3a2c10' }}>
        {(['stats', 'talents'] as Tab[]).map(t => (
          <button
            key={t}
            className="rp-button flex-1"
            style={{
              background: tab === t ? 'rgba(200,161,0,0.15)' : undefined,
              borderBottom: tab === t ? '2px solid #ffd700' : '2px solid transparent',
              borderRadius: 0,
              textTransform: 'capitalize',
              position: 'relative',
            }}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'talents' && talentPoints > 0 && (
              <span style={{
                position: 'absolute',
                top: 2,
                right: 4,
                background: '#00cc66',
                color: '#000',
                borderRadius: '50%',
                width: 14,
                height: 14,
                fontSize: '0.5rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {talentPoints}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 panel-scroll p-2" style={{ fontSize: '0.7rem' }}>
        {tab === 'stats' && (
          <div>
            <div style={{ color: '#ffd700', marginBottom: 4, fontWeight: 700 }}>
              Level {level} {classDef.name}
            </div>
            <div style={{ marginBottom: 10 }}>
              <HealthBar
                current={xp}
                max={xpNeeded}
                type="xp"
                height={14}
                label={`XP ${Math.floor(xp)} / ${xpNeeded}`}
              />
              <div style={{ fontSize: '0.55rem', color: '#9d9d9d', marginTop: 2, textAlign: 'right' }}>
                {xpNeeded - Math.floor(xp)} XP to level {level + 1}
              </div>
            </div>
            {[
              ['HP',           `${Math.floor(stats.currentHp)} / ${stats.maxHp}`],
              ['Strength',      stats.strength],
              ['Intellect',     stats.intellect],
              ['Agility',       stats.agility],
              ['Stamina',       stats.stamina],
              ['Armor',         stats.armor],
              ['Weapon DPS',    stats.weaponDps.toFixed(1)],
              ['Attack Speed',  `${stats.attackSpeedSeconds.toFixed(1)}s`],
              ['Crit Chance',   `${(stats.critChance * 100).toFixed(1)}%`],
              ['Gold Find',     `${((stats.goldFindBonus - 1) * 100).toFixed(0)}% bonus`],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between py-0.5" style={{ borderBottom: '1px solid #1a1508' }}>
                <span style={{ color: '#9d9d9d' }}>{label}</span>
                <span style={{ color: '#d4b896' }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'talents' && <TalentTree />}
      </div>
    </CollapsiblePanel>
  )
}
