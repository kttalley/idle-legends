import React, { useState } from 'react'
import { useGameStore, bagCapacity, bagSlotCost, townPrice, rarityColor } from '../../store/gameStore'
import { TOWNS } from '../../data/towns'
import { isTownHostileToPlayer } from '../../engine/zoneProgression'
import {
  BAG_SLOTS_MAX_PURCHASED, MERCHANT_CONTRACT_COST, MERCHANT_UPKEEP_RATE, RARITY_ORDER,
} from '../../data/constants'
import type { Rarity } from '../../data/types'
import { UPGRADES, upgradeCost } from '../../data/upgrades'
import { TOWN_NPC_BY_ID } from '../../data/townNpcs'
import { SpriteIcon } from '../ui/SpriteIcon'

/**
 * Town, as a conversation rather than a control panel.
 *
 * This used to render every service at once — rest, bags, the factor, four standing
 * upgrades — in one tall sheet that sat permanently over the town scene. Two problems:
 * the hub the renderer draws was never visible, and the panel was a wall of controls with
 * no sense of place.
 *
 * Now each service belongs to somebody standing somewhere (data/townNpcs.ts). Walking up
 * to them opens their business and nothing else; walking away closes it. When the hero is
 * not standing with anyone this is a single line telling them so, and the town is on show.
 */

const FACTION_COLOR: Record<string, string> = {
  alliance: '#6699ff',
  horde:    'var(--danger)',
  neutral:  '#ddaa44',
}

const TYPE_COLOR: Record<string, string> = {
  friendly: '#44ff88',
  neutral:  '#ddaa44',
  hostile:  'var(--danger)',
}

/** Shared frame: who you are talking to, what they said, then their business. */
function NpcPanel({ id, children }: { id: keyof typeof TOWN_NPC_BY_ID; children: React.ReactNode }) {
  const npc = TOWN_NPC_BY_ID[id]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)' }}>{npc.role}</span>
        <span style={{ fontSize: '0.58rem', color: 'var(--parchment)', fontStyle: 'italic' }}>{npc.name}</span>
      </div>
      <div style={{ fontSize: '0.55rem', color: 'var(--muted)', fontStyle: 'italic' }}>
        “{npc.greeting}”
      </div>
      {children}
    </div>
  )
}

export function TownView() {
  const {
    currentTown, generatedTownNames, restInTown, leaveTown, playerFaction, activeTownNpc,
    gold, bagSlotsPurchased, buyBagSlot,
    merchantContract, buyMerchantContract, setMerchantThreshold, cancelMerchantContract,
    totalAutoSold, totalUpkeepPaid, upgradeRanks, buyUpgrade,
  } = useGameStore()
  const [restFeedback, setRestFeedback] = useState(false)

  if (!currentTown) return null
  const town = TOWNS[currentTown]
  if (!town) return null

  const displayName    = generatedTownNames[currentTown] ?? town.name
  const factionColor   = FACTION_COLOR[town.faction] ?? 'var(--parchment)'
  const typeColor      = TYPE_COLOR[town.type] ?? '#888'
  const hostileToPlayer = isTownHostileToPlayer(currentTown, playerFaction)
  const trades         = town.services.includes('vendor')

  function handleRest() {
    if (hostileToPlayer) return
    restInTown()
    setRestFeedback(true)
    setTimeout(() => setRestFeedback(false), 2000)
  }

  const slotsBought  = bagSlotsPurchased ?? 0
  const capacity     = bagCapacity({ bagSlotsPurchased: slotsBought })
  const bagMaxed     = slotsBought >= BAG_SLOTS_MAX_PURCHASED
  const slotCost     = townPrice(bagSlotCost(slotsBought), currentTown, playerFaction)
  const contractCost = townPrice(MERCHANT_CONTRACT_COST, currentTown, playerFaction)
  const contractNet  = totalAutoSold - totalUpkeepPaid
  const upkeepPct    = Math.round(MERCHANT_UPKEEP_RATE * 100)

  return (
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Where you are — one compact line, not a header block. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: factionColor }}>{displayName}</span>
        <span style={{ fontSize: '0.5rem', color: typeColor }}>
          {town.type}{town.type === 'hostile' && <> <SpriteIcon ui="warn" size={10} /></>}
        </span>
        <button
          className="rp-button"
          onClick={leaveTown}
          style={{ fontSize: '0.55rem', padding: '2px 8px', marginLeft: 'auto' }}
        >
          Leave
        </button>
      </div>

      {/* ── Nobody nearby: the town is the interface ─────────────────────────── */}
      {!activeTownNpc && (
        <div style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>
          Walk up to someone to do business.
          <span style={{ color: '#7a6a4a', fontStyle: 'italic' }}>
            {' '}Tap a name in the square to go to them.
          </span>
        </div>
      )}

      {/* ── Innkeeper ─────────────────────────────────────────────────────────── */}
      {activeTownNpc === 'rest' && (
        <NpcPanel id="rest">
          {hostileToPlayer ? (
            <div style={{ fontSize: '0.55rem', color: '#ff6666' }}>
              They know whose colours you wear. No bed here.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="rp-button" onClick={handleRest} style={{ fontSize: '0.6rem' }}>
                Rest & Recover
              </button>
              {restFeedback && (
                <span style={{ fontSize: '0.55rem', color: '#44ff88' }}>Full HP restored</span>
              )}
            </div>
          )}
        </NpcPanel>
      )}

      {/* ── Outfitter: bag slots ──────────────────────────────────────────────── */}
      {activeTownNpc === 'outfitter' && trades && (
        <NpcPanel id="outfitter">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="rp-button"
              onClick={buyBagSlot}
              disabled={bagMaxed || gold < slotCost}
              title={bagMaxed ? 'Nothing larger in stock.' : gold < slotCost ? `Need ${slotCost}g` : undefined}
              style={{ fontSize: '0.6rem', opacity: bagMaxed || gold < slotCost ? 0.5 : 1 }}
            >
              {bagMaxed ? 'Bag maxed' : `Buy a slot — ${slotCost.toLocaleString()}g`}
            </button>
            <span style={{ fontSize: '0.55rem', color: 'var(--muted)' }}>
              {capacity} slots{!bagMaxed && ` · ${BAG_SLOTS_MAX_PURCHASED - slotsBought} more available`}
            </span>
          </div>
          <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic' }}>
            {hostileToPlayer
              ? 'They will take your gold without pretending to like you — prices are marked up.'
              : 'A bigger bag means longer in the field before drops start going for scrap.'}
          </div>
        </NpcPanel>
      )}

      {/* ── Factor: the merchant contract ─────────────────────────────────────── */}
      {activeTownNpc === 'factor' && trades && (
        <NpcPanel id="factor">
          {!merchantContract ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="rp-button"
                  onClick={buyMerchantContract}
                  disabled={gold < contractCost}
                  title={gold < contractCost ? `Need ${contractCost}g` : undefined}
                  style={{ fontSize: '0.6rem', opacity: gold < contractCost ? 0.5 : 1 }}
                >
                  Retain — {contractCost.toLocaleString()}g
                </button>
                <span style={{ fontSize: '0.55rem', color: 'var(--muted)' }}>
                  then {upkeepPct}% of what they move
                </span>
              </div>
              <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic' }}>
                They buy every drop below your chosen rarity the moment it falls, at full
                price — never an upgrade, never more than they earned. Works hardest while
                you are away.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.58rem', color: merchantContract.lapsed ? '#ff8844' : 'var(--success)' }}>
                  {merchantContract.lapsed ? 'Idle — upkeep unpaid' : 'On retainer'}
                </span>
                <span style={{ fontSize: '0.52rem', color: 'var(--muted)' }}>
                  earned {totalAutoSold.toLocaleString()}g · upkeep {totalUpkeepPaid.toLocaleString()}g ·{' '}
                  <span style={{ color: contractNet >= 0 ? '#44ff88' : '#ff6666' }}>
                    net {contractNet >= 0 ? '+' : ''}{contractNet.toLocaleString()}g
                  </span>
                </span>
                <button
                  className="rp-button"
                  onClick={cancelMerchantContract}
                  style={{ fontSize: '0.52rem', padding: '2px 7px' }}
                  title="End the arrangement. No refund, but no more upkeep."
                >
                  Release
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.52rem', color: 'var(--muted)' }}>Sells below:</span>
                {(RARITY_ORDER as readonly Rarity[]).map(r => {
                  const active = merchantContract.threshold === r
                  return (
                    <button
                      key={r}
                      className="rp-button"
                      onClick={() => setMerchantThreshold(r)}
                      title={r === 'common' ? 'Sell nothing — the arrangement idles' : `Keep ${r} and better`}
                      style={{
                        fontSize: '0.52rem', padding: '2px 6px', textTransform: 'capitalize',
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
            </>
          )}
        </NpcPanel>
      )}

      {/* ── Quartermaster: standing upgrades ──────────────────────────────────── */}
      {activeTownNpc === 'quartermaster' && trades && (
        <NpcPanel id="quartermaster">
          {UPGRADES.map(u => {
            const rank   = upgradeRanks[u.id] ?? 0
            const cost   = townPrice(upgradeCost(rank), currentTown, playerFaction)
            const afford = gold >= cost
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <button
                  className="rp-button"
                  onClick={() => buyUpgrade(u.id)}
                  disabled={!afford}
                  title={afford ? u.flavour : `Need ${cost.toLocaleString()}g`}
                  style={{
                    fontSize: '0.55rem', minWidth: 128, textAlign: 'left',
                    opacity: afford ? 1 : 0.5,
                    color: rarityColor(u.tint),
                    borderColor: rank > 0 ? rarityColor(u.tint) : undefined,
                  }}
                >
                  {u.name}{rank > 0 && <span style={{ opacity: 0.8 }}> ·{rank}</span>}
                </button>
                <span style={{ fontSize: '0.5rem', color: 'var(--muted)' }}>
                  {u.description} — {cost.toLocaleString()}g
                </span>
              </div>
            )
          })}
          <div style={{ fontSize: '0.5rem', color: '#7a6a4a', fontStyle: 'italic' }}>
            Every rank costs more than the last, and there is no final rank.
          </div>
        </NpcPanel>
      )}
    </div>
  )
}
