import { CollapsiblePanel, expandPanel } from '../ui/CollapsiblePanel'
import React, { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { xpForLevel } from '../../engine/progression'
import { HealthBar } from '../ui/HealthBar'

/** Dispatched on `window` by anything that wants to send the player to the talent tree.
 *  The panel picks the tab and unfolds itself; App opens the drawer that holds it. */
export const OPEN_TALENTS_EVENT = 'stillmarch-open-talents'
import { TalentTree } from './TalentTree'

type Tab = 'stats' | 'talents'

export function CharacterPanel() {
  const {
    stats, level, xp, playerClass, talentPoints, playerName, nameGenStatus,
  } = useGameStore()
  const classDef = CLASS_DEFINITIONS[playerClass]
  const xpNeeded = xpForLevel(level)
  const [tab, setTab] = useState<Tab>('stats')
  // `OPEN_TALENTS_EVENT` (the offline report's "Spend talent points") lands on the tree.
  useEffect(() => {
    const open = () => { setTab('talents'); expandPanel('character', 'rail-left') }
    window.addEventListener(OPEN_TALENTS_EVENT, open)
    return () => window.removeEventListener(OPEN_TALENTS_EVENT, open)
  }, [])

  return (
    // `grow` rather than `h-full`: asking for 100% height made this panel claim the whole
    // rail and squeeze Zones down to a single clipped row. Growing into leftover space
    // shares the column instead of taking it.
    // Shares the left rail's accordion with Zones. Stats and Talents are tall enough that
    // with both sections open neither was readable — this is the one that yields, because
    // it is the one you open deliberately rather than glance at.
    <CollapsiblePanel
      id="character"
      group="rail-left"
      defaultCollapsed
      grow
      title={
        // Gold, Looks and Heroes used to share this header; they are account-level
        // controls, not character-sheet ones, and they now live in `HeroBar` at the top
        // of the rail. With the width back, the class and the hero's name fit on one
        // line each — a long generated name is the norm here, not the exception.
        <span style={{ display: 'block', minWidth: 0 }}>
          {/* Level leads. It is the number the player checks most often and the one that
              gates every zone on the track below, so it should not require reading past
              the class name to find — and when the header is collapsed this line is the
              only thing left, which makes the level's absence from it conspicuous. */}
          <span className="char-level">{level}</span>
          <span className={classDef.colorClass}>{classDef.name}</span>
          {playerName && (
            <span style={{
              display: 'block', fontSize: '0.58rem', color: 'var(--parchment)', fontStyle: 'italic',
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
        // Indicator on the COLLAPSED accordion. When the panel is open, the in-panel
        // Talents tab carries its own badge; when it's folded, the player can't see
        // that tab at all. The dock button already shows the count, but the dock can
        // be off-screen on mobile, and the indicator here is the one that answers
        // "is there anything for me in this drawer?" at a glance.
        talentPoints > 0 ? (
          <span
            className="char-accordion-badge"
            title={`${talentPoints} talent point${talentPoints === 1 ? '' : 's'} to spend`}
          >
            +{talentPoints}
          </span>
        ) : undefined
      }
    >

      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: 'var(--edge)' }}>
        {(['stats', 'talents'] as Tab[]).map(t => (
          <button
            key={t}
            className="rp-button flex-1"
            style={{
              background: tab === t ? 'rgba(200,161,0,0.15)' : undefined,
              borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
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
                background: 'rgba(0,0,0,0.55)',
                color: 'var(--gold)',
                borderRadius: 999,
                minWidth: 14,
                height: 14,
                padding: '0 4px',
                fontSize: '0.55rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 216, 107, 0.7)',
                textShadow: '0 0 3px rgba(255, 216, 107, 0.85)',
                boxShadow: '0 0 4px rgba(255, 216, 107, 0.45)',
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
            {/* "Level 24 Warrior" used to head this tab. The panel header directly above
                now leads with the level and the class, so the line was saying the same
                thing twice in the space of 30 vertical pixels. */}
            <div style={{ marginBottom: 10 }}>
              <HealthBar
                current={xp}
                max={xpNeeded}
                type="xp"
                height={14}
                label={`XP ${Math.floor(xp)} / ${xpNeeded}`}
              />
              <div style={{ fontSize: '0.55rem', color: 'var(--muted)', marginTop: 2, textAlign: 'right' }}>
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
              <div key={String(label)} className="flex justify-between py-0.5" style={{ borderBottom: '1px solid var(--ink)' }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ color: 'var(--parchment)' }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'talents' && <TalentTree />}
      </div>
    </CollapsiblePanel>
  )
}
