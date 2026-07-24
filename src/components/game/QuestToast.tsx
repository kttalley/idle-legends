import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'

export function QuestToast() {
  const activeQuest = useGameStore(s => s.activeQuest)
  const generatedZoneNames = useGameStore(s => s.generatedZoneNames)
  const claimQuestReward = useGameStore(s => s.claimQuestReward)
  const dismissQuestReward = useGameStore(s => s.dismissQuestReward)

  if (!activeQuest || !activeQuest.completed || activeQuest.claimed) return null

  const rewardZone = activeQuest.rewardZoneId ? ZONES[activeQuest.rewardZoneId] : undefined
  const rewardName = rewardZone
    ? (generatedZoneNames[activeQuest.rewardZoneId!] ?? rewardZone.name)
    : undefined

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
          <span style={{ fontSize: '1.1rem' }}>🏆</span>
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
            fontFamily: 'Cinzel, serif',
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
              color: '#ffaa44',
              marginBottom: 10,
            }}
          >
            Reward: passage to {rewardName}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="rp-button flex-1"
            style={{ fontSize: '0.62rem', background: 'linear-gradient(180deg, #6a5228, #4a3518)' }}
            onClick={() => claimQuestReward(activeQuest.id)}
          >
            Venture Onward
          </button>
          <button
            className="rp-button"
            style={{ fontSize: '0.6rem', color: '#a09080' }}
            onClick={() => dismissQuestReward(activeQuest.id)}
          >
            Stay
          </button>
        </div>
      </div>
    </div>
  )
}
