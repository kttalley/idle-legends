import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'
import { canEnterZone } from '../../engine/zoneProgression'
import { SpriteIcon } from '../ui/SpriteIcon'

export function QuestToast() {
  const activeQuest = useGameStore(s => s.activeQuest)
  const generatedZoneNames = useGameStore(s => s.generatedZoneNames)
  const claimQuestReward = useGameStore(s => s.claimQuestReward)
  const dismissQuestReward = useGameStore(s => s.dismissQuestReward)
  const level = useGameStore(s => s.level)
  const bossesDefeated = useGameStore(s => s.bossesDefeated)

  if (!activeQuest || !activeQuest.completed || activeQuest.claimed) return null

  const rewardZone = activeQuest.rewardZoneId ? ZONES[activeQuest.rewardZoneId] : undefined
  const rewardName = rewardZone
    ? (generatedZoneNames[activeQuest.rewardZoneId!] ?? rewardZone.name)
    : undefined
  // The boss is gated on kill count but the next zone is gated on LEVEL, so slaying a
  // boss early leaves the reward zone still shut. Previously the toast offered "Venture
  // Onward" anyway and the click silently did nothing — say what's actually required.
  const canTravel = !!activeQuest.rewardZoneId && canEnterZone(activeQuest.rewardZoneId, level, bossesDefeated)
  const levelNeeded = rewardZone?.levelRange[0] ?? 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        width: 'min(360px, 92vw)',
      }}
    >
      <div
        className="rp-panel"
        style={{
          padding: '10px 12px',
          borderColor: '#ffd700',
          boxShadow: '0 8px 32px rgba(0,0,0,0.9), 0 0 16px rgba(255,215,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <SpriteIcon ui="trophy" size={17} />
          <span
            style={{
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#ffd700',
            }}
          >
            Quest Complete
          </span>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.85rem',
            color: '#ffe9a8',
            marginBottom: 4,
          }}
        >
          {activeQuest.title}
        </div>

        <div
          style={{
            fontSize: '0.6rem',
            color: '#b8a070',
            lineHeight: 1.4,
            marginBottom: 10,
          }}
        >
          {activeQuest.description}
        </div>

        {rewardName && (
          <div
            style={{
              fontSize: '0.55rem',
              color: canTravel ? '#ffaa44' : '#b8a070',
              marginBottom: 10,
            }}
          >
            {canTravel
              ? `Reward: passage to ${rewardName}`
              : `${rewardName} opens at level ${levelNeeded} — you are ${level}.`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {canTravel && (
            <button
              className="rp-button flex-1"
              style={{ fontSize: '0.62rem', background: 'linear-gradient(180deg, #6a5228, #4a3518)' }}
              onClick={() => claimQuestReward(activeQuest.id)}
            >
              Venture Onward
            </button>
          )}
          <button
            className="rp-button"
            style={{ fontSize: '0.6rem', color: canTravel ? '#a09080' : '#ffe9a8', flex: canTravel ? undefined : 1 }}
            onClick={() => dismissQuestReward(activeQuest.id)}
          >
            {canTravel ? 'Stay' : 'Keep Hunting'}
          </button>
        </div>
      </div>
    </div>
  )
}
