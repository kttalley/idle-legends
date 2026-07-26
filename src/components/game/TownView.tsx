import React, { useState } from 'react'
import { useGameStore, bagCapacity, bagSlotCost, townPrice, rarityColor } from '../../store/gameStore'
import { TOWNS } from '../../data/towns'
import { isTownHostileToPlayer } from '../../engine/zoneProgression'
import {
  BAG_SLOTS_MAX_PURCHASED, MERCHANT_CONTRACT_COST, MERCHANT_UPKEEP_RATE, RARITY_ORDER,
} from '../../data/constants'
import type { Rarity } from '../../data/types'
import { UPGRADES, upgradeCost } from '../../data/upgrades'
import { SpriteIcon } from '../ui/SpriteIcon'

const FACTION_COLOR: Record<string, string> = {
  alliance: '#6699ff',
  horde:    '#ff4444',
  neutral:  '#ddaa44',
}

const TYPE_LABEL: Record<string, string> = {
  friendly: 'Friendly',
  neutral:  'Neutral',
  hostile:  'Hostile',
}

const TYPE_COLOR: Record<string, string> = {
  friendly: '#44ff88',
  neutral:  '#ddaa44',
  hostile:  '#ff4444',
}

export function TownView() {
  const {
    currentTown, generatedTownNames, restInTown, leaveTown, playerFaction,
    gold, bagSlotsPurchased, buyBagSlot,
    merchantContract, buyMerchantContract, setMerchantThreshold, cancelMerchantContract,
    totalAutoSold, totalUpkeepPaid, upgradeRanks, buyUpgrade,
  } = useGameStore()
  const [restFeedback, setRestFeedback] = useState(false)

  if (!currentTown) return null
  const town = TOWNS[currentTown]
  if (!town) return null

  const displayName = generatedTownNames[currentTown] ?? town.name
  const factionColor = FACTION_COLOR[town.faction] ?? '#d4b896'
  const typeLabel = TYPE_LABEL[town.type] ?? town.type
  const typeColor = TYPE_COLOR[town.type] ?? '#888'
  const hostileToPlayer = isTownHostileToPlayer(currentTown, playerFaction)

  function handleRest() {
    if (hostileToPlayer) return
    restInTown()
    setRestFeedback(true)
    setTimeout(() => setRestFeedback(false), 2000)
  }

  // The outfitter sells bag slots — capacity, not goods. Hostile towns still trade;
  // they just charge for the privilege (they deny rest, not commerce).
  const slotsBought = bagSlotsPurchased ?? 0
  const capacity    = bagCapacity({ bagSlotsPurchased: slotsBought })
  const bagMaxed    = slotsBought >= BAG_SLOTS_MAX_PURCHASED
  const slotCost    = townPrice(bagSlotCost(slotsBought), currentTown, playerFaction)
  const canAfford   = gold >= slotCost

  // The factor: a standing arrangement rather than a purchase, so the panel shows what
  // it has earned against what it has cost — the player should be able to judge it.
  const contractCost = townPrice(MERCHANT_CONTRACT_COST, currentTown, playerFaction)
  const contractNet  = totalAutoSold - totalUpkeepPaid
  const upkeepPct    = Math.round(MERCHANT_UPKEEP_RATE * 100)

  return (
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: factionColor }}>
          {displayName}
        </span>
        <span
          style={{
            fontSize: '0.5rem',
            color: typeColor,
            border: `1px solid ${typeColor}`,
            borderRadius: 3,
            padding: '0 4px',
            lineHeight: '1.4',
          }}
        >
          {typeLabel}{town.type === 'hostile' && <> <SpriteIcon ui="warn" size={11} /></>}
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: '0.55rem', color: '#9d9d9d', fontStyle: 'italic' }}>
        {town.description}
      </div>

      {hostileToPlayer && (
        <div style={{ fontSize: '0.55rem', color: '#ff6666' }}>
          The locals recognize you as an enemy of {town.faction === 'horde' ? 'the Ashmarch' : 'the Concord'}. Rest is denied here.
        </div>
      )}

      {/* Services */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {town.services.includes('rest') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="rp-button"
              onClick={handleRest}
              disabled={hostileToPlayer}
              style={{ fontSize: '0.55rem', padding: '2px 8px' }}
            >
              Rest & Recover
            </button>
            {restFeedback && (
              <span style={{ fontSize: '0.5rem', color: '#44ff88' }}>
                Full HP restored
              </span>
            )}
          </div>
        )}
        {town.services.includes('vendor') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="rp-button"
              onClick={buyBagSlot}
              disabled={bagMaxed || !canAfford}
              title={
                bagMaxed ? 'The outfitter has nothing larger.'
                : !canAfford ? `Need ${slotCost}g`
                : `One more slot, to ${capacity + 1}`
              }
              style={{ fontSize: '0.55rem', padding: '2px 8px', opacity: bagMaxed || !canAfford ? 0.5 : 1 }}
            >
              {bagMaxed ? 'Bag maxed' : `Buy bag slot — ${slotCost}g`}
            </button>
            <span style={{ fontSize: '0.5rem', color: '#9d9d9d' }}>
              {capacity} slots
              {!bagMaxed && ` (${BAG_SLOTS_MAX_PURCHASED - slotsBought} more available)`}
            </span>
          </div>
        )}
      </div>

      {town.services.includes('vendor') && (
        <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic' }}>
          {hostileToPlayer
            ? 'They will take your gold. They will not pretend to like you — prices are marked up.'
            : 'A bigger bag means longer in the field before drops start going for scrap.'}
        </div>
      )}

      {/* ── The factor ──────────────────────────────────────────────────────── */}
      {town.services.includes('vendor') && (
        <div style={{ borderTop: '1px solid #3a2c10', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!merchantContract ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="rp-button"
                  onClick={buyMerchantContract}
                  disabled={gold < contractCost}
                  title={gold < contractCost ? `Need ${contractCost}g` : 'They buy your junk in the field, at full price'}
                  style={{ fontSize: '0.55rem', padding: '2px 8px', opacity: gold < contractCost ? 0.5 : 1 }}
                >
                  Retain a factor — {contractCost}g
                </button>
                <span style={{ fontSize: '0.5rem', color: '#9d9d9d' }}>
                  then {upkeepPct}% of what they move
                </span>
              </div>
              <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic' }}>
                They buy every drop below your chosen rarity the moment it falls, at full
                price — so it never fills a bag slot and never goes for scrap. They keep
                their {upkeepPct}% cut, never an upgrade, and never more than they earned.
                Works hardest while you are away.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.55rem', color: merchantContract.lapsed ? '#ff8844' : '#88ccaa' }}>
                  Factor {merchantContract.lapsed ? 'idle — upkeep unpaid' : 'on retainer'}
                </span>
                <span style={{ fontSize: '0.5rem', color: '#9d9d9d' }}>
                  earned {totalAutoSold}g · upkeep {totalUpkeepPaid}g ·{' '}
                  <span style={{ color: contractNet >= 0 ? '#44ff88' : '#ff6666' }}>
                    net {contractNet >= 0 ? '+' : ''}{contractNet}g
                  </span>
                </span>
                <button
                  className="rp-button"
                  onClick={cancelMerchantContract}
                  style={{ fontSize: '0.5rem', padding: '1px 6px' }}
                  title="End the arrangement. No refund, but no more upkeep."
                >
                  Release
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.5rem', color: '#9d9d9d' }}>Sells below:</span>
                {(RARITY_ORDER as readonly Rarity[]).map(r => {
                  const active = merchantContract.threshold === r
                  return (
                    <button
                      key={r}
                      className="rp-button"
                      onClick={() => setMerchantThreshold(r)}
                      title={r === 'common' ? 'Sell nothing — the arrangement idles' : `Keep ${r} and better`}
                      style={{
                        fontSize: '0.5rem', padding: '1px 5px', textTransform: 'capitalize',
                        color: rarityColor(r),
                        borderColor: active ? rarityColor(r) : undefined,
                        background: active ? `${rarityColor(r)}22` : undefined,
                      }}
                    >
                      {r}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic' }}>
                {merchantContract.threshold === 'common'
                  ? 'Set to keep everything, so they are selling nothing — and still drawing upkeep.'
                  : `Keeping ${merchantContract.threshold} and better; anything below is sold where it falls.`}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Standing upgrades: the sink that never runs out ──────────────────── */}
      {town.services.includes('vendor') && (
        <div style={{ borderTop: '1px solid #3a2c10', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '0.55rem', color: '#d4b896', fontWeight: 700 }}>
            Standing arrangements
          </div>
          {UPGRADES.map(u => {
            const rank = upgradeRanks[u.id] ?? 0
            const cost = townPrice(upgradeCost(rank), currentTown, playerFaction)
            const afford = gold >= cost
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className="rp-button"
                  onClick={() => buyUpgrade(u.id)}
                  disabled={!afford}
                  title={afford ? u.flavour : `Need ${cost.toLocaleString()}g`}
                  style={{
                    fontSize: '0.55rem', padding: '2px 8px', opacity: afford ? 1 : 0.5,
                    minWidth: 132, textAlign: 'left',
                    color: rarityColor(u.tint),
                    borderColor: rank > 0 ? rarityColor(u.tint) : undefined,
                  }}
                >
                  {u.name} {rank > 0 && <span style={{ opacity: 0.8 }}>·{rank}</span>}
                </button>
                <span style={{ fontSize: '0.5rem', color: '#9d9d9d' }}>
                  {u.description} — {cost.toLocaleString()}g
                </span>
              </div>
            )
          })}
          <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic' }}>
            Every rank costs more than the last, and there is no final rank. Gold you are
            not spending is gold doing nothing.
          </div>
        </div>
      )}

      {/* Leave */}
      <div>
        <button
          className="rp-button"
          onClick={leaveTown}
          style={{ fontSize: '0.55rem', padding: '2px 8px' }}
        >
          Leave Town
        </button>
      </div>
    </div>
  )
}
