import React from 'react'
import { useGameStore } from '../../../store/gameStore'
import { ZONES } from '../../../data/zones'
import {
  generateFloor, floorLevelLimit, floorMinLevel, AFFIX_RULES, MILESTONE_EVERY,
} from '../../../engine/undermaw'
import type { UndermawAffix } from '../../../data/types'

// The Undermaw's objective tracker (docs/UNDERMAW.md; interaction research 2026-11-20).
// Shown in place of the zone objective while the hero is in the Undermaw. Same rows and
// meters as ObjectiveTracker so it reads as the same kind of thing.
//
// Accessibility: every meter is a progressbar with a spoken value; modifiers carry a shape
// AND a name AND a rule, so colour never carries meaning alone; nothing here moves focus.

/** Shape glyphs for modifiers: distinct silhouettes, readable without colour. */
const AFFIX_GLYPH: Record<UndermawAffix, string> = {
  hasted: '»', vampiric: '♥', warded: '◈', thorned: '✶', splitting: 'Y',
}
const AFFIX_NAME: Record<UndermawAffix, string> = {
  hasted: 'Hasted', vampiric: 'Vampiric', warded: 'Warded', thorned: 'Thorned', splitting: 'Splitting',
}

export function UndermawTracker() {
  const u = useGameStore(s => s.undermaw)
  const level = useGameStore(s => s.level)
  const currentMob = useGameStore(s => s.currentMob)
  const leave = useGameStore(s => s.leaveUndermaw)
  const setPush = useGameStore(s => s.setUndermawPushDeeper)

  const floor = generateFloor(u.depth)
  const kills = Math.min(u.floorKills, floor.killTarget)
  const bossUp = u.floorKills >= floor.killTarget
  const limit = floorLevelLimit(u.depth)
  const atLimit = level >= limit
  const nextGate = floorMinLevel(u.depth + 1)
  const crown = u.depth % MILESTONE_EVERY === 0
  const affixes = currentMob?.affixes ?? []
  const biomes = floor.biomes.map(b => ZONES[b]?.name ?? b).join(' / ')
  const btn: React.CSSProperties = { pointerEvents: 'auto' }

  return (
    <div className="objective-tracker" aria-label={`The Undermaw, floor ${u.depth}, best floor ${u.best}`}>
      <div className="objective-tracker-head" style={{ cursor: 'default' }}>
        <span className="objective-title">Undermaw, floor {u.depth}</span>
      </div>
      <div className="objective-body">
        <div className="objective-row">
          <span className="objective-tick" aria-hidden>⌄</span>
          <span className="objective-text" title={biomes}>Best: floor {u.best}</span>
          <span className="objective-count">{biomes.split(' / ')[0]}</span>
        </div>

        <div className={`objective-row${bossUp ? ' is-done' : ''}`}>
          <span className="objective-tick" aria-hidden>{bossUp ? '✓' : '•'}</span>
          <span className="objective-text">Slay {floor.killTarget} on this floor</span>
          <span className="objective-count">{kills}/{floor.killTarget}</span>
        </div>
        <div className="objective-meter" role="progressbar" aria-valuemin={0} aria-valuemax={floor.killTarget}
             aria-valuenow={kills} aria-valuetext={`${kills} of ${floor.killTarget} kills, floor ${u.depth}`}>
          <i style={{ width: `${(kills / floor.killTarget) * 100}%` }} />
        </div>

        <div className={`objective-row${bossUp ? '' : ' is-locked'}`}>
          <span className="objective-tick" aria-hidden>{crown ? '♛' : '•'}</span>
          <span className="objective-text">Defeat {crown ? 'the Hollow Crown' : 'the floor boss'}</span>
          {bossUp && <span className="objective-count is-ready">ready</span>}
        </div>

        {/* The level limit, in words, so "why did levelling stop?" never needs asking. */}
        <div className={`objective-row${atLimit ? ' is-locked' : ''}`}>
          <span className="objective-tick" aria-hidden>{atLimit ? '🔒' : '↑'}</span>
          <span className="objective-text">
            {atLimit ? 'Level limit reached here. Go deeper to keep levelling.' : `This floor teaches up to level ${limit}`}
          </span>
        </div>
        {level < nextGate && (
          <div className="objective-warn">Floor {u.depth + 1} opens at level {nextGate}.</div>
        )}

        {affixes.length > 0 && (
          <div className="objective-row" aria-label={`${currentMob?.name}: ${affixes.map(a => AFFIX_RULES[a]).join(' ')}`}>
            <span className="objective-text">
              {affixes.map(a => (
                <span key={a} title={AFFIX_RULES[a]} style={{ marginRight: 8, whiteSpace: 'nowrap' }}>
                  <span aria-hidden>{AFFIX_GLYPH[a]}</span> {AFFIX_NAME[a]}
                </span>
              ))}
            </span>
          </div>
        )}

        <label className="objective-row" style={btn}>
          <input type="checkbox" checked={u.pushDeeper} onChange={e => setPush(e.target.checked)} style={{ marginRight: 6 }} />
          <span className="objective-text">Push deeper when ready</span>
        </label>
        <button type="button" className="objective-row" style={{ ...btn, justifyContent: 'center' }} onClick={leave}>
          Leave the Undermaw
        </button>
        {u.titles.length > 0 && (
          <div className="objective-warn" title="Milestone titles">Title: {u.titles[u.titles.length - 1]}</div>
        )}
      </div>
    </div>
  )
}
