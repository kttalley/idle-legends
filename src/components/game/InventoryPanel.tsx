import React, { useState } from 'react'
import { useGameStore, rarityColor } from '../../store/gameStore'
import { TooltipWrapper, ItemTooltipContent } from '../ui/Tooltip'
import type { Item, Slot } from '../../data/types'

const SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']
const SLOT_LABEL: Record<Slot, string> = {
  weapon: 'WPN', helm: 'HLM', chest: 'CHT', legs: 'LGS', boots: 'BTS', trinket: 'TRK',
}

function ItemBox({ item, onClick, equippedItem, isEquipped = false }: {
  item: Item
  onClick: () => void
  equippedItem?: Item | null
  isEquipped?: boolean
}) {
  const color = rarityColor(item.rarity)
  return (
    <TooltipWrapper content={<ItemTooltipContent item={item} equippedItem={equippedItem} />}>
      <div
        className="inventory-slot occupied"
        style={{
          width: 36,
          height: 36,
          border: `2px solid ${color}`,
          boxShadow: isEquipped ? `0 0 6px ${color}88` : undefined,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.55rem',
          color,
          fontWeight: 700,
          textAlign: 'center',
          padding: 1,
          background: `${color}15`,
          userSelect: 'none',
        }}
        onClick={onClick}
        title={item.name}
      >
        {item.slot.slice(0, 3).toUpperCase()}
      </div>
    </TooltipWrapper>
  )
}

export function InventoryPanel() {
  const { inventory, equipment, equipItem, unequipItem, sellItem, sellAllCommon } = useGameStore()
  const [activeTab, setActiveTab] = useState<'inventory' | 'equipment'>('equipment')

  return (
    <div className="wow-panel flex flex-col h-full">
      <div className="wow-panel-header">Inventory</div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: '#3a2c10' }}>
        {(['equipment', 'inventory'] as const).map(t => (
          <button
            key={t}
            className="wow-button flex-1"
            style={{
              background: activeTab === t ? 'rgba(200,161,0,0.15)' : undefined,
              borderBottom: activeTab === t ? '2px solid #ffd700' : '2px solid transparent',
              borderRadius: 0,
              textTransform: 'capitalize',
            }}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 panel-scroll p-2">
        {activeTab === 'equipment' && (
          <div>
            <div style={{ fontSize: '0.65rem', color: '#9d9d9d', marginBottom: 6 }}>
              Click an equipped item to unequip it.
            </div>
            {SLOTS.map(slot => {
              const item = equipment[slot]
              const color = item ? rarityColor(item.rarity) : '#3a2c10'
              return (
                <div key={slot} className="flex items-center gap-2 mb-1.5">
                  <div style={{
                    width: 36,
                    height: 20,
                    fontSize: '0.55rem',
                    color: '#666',
                    flexShrink: 0,
                    fontFamily: 'monospace',
                  }}>
                    {SLOT_LABEL[slot]}
                  </div>
                  {item ? (
                    <ItemBox
                      item={item}
                      isEquipped
                      onClick={() => unequipItem(slot)}
                      equippedItem={null}
                    />
                  ) : (
                    <div
                      className="inventory-slot"
                      style={{ width: 36, height: 36, border: '1px dashed #3a2c10' }}
                    />
                  )}
                  {item && (
                    <div style={{ fontSize: '0.65rem', color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'inventory' && (
          <div>
            <div className="flex justify-between items-center mb-2" style={{ fontSize: '0.65rem' }}>
              <span style={{ color: '#9d9d9d' }}>
                {inventory.filter(Boolean).length} / {inventory.length} slots
              </span>
              <button className="wow-button" style={{ fontSize: '0.6rem' }} onClick={sellAllCommon}>
                Sell Common
              </button>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
              {inventory.map((item, i) => (
                item ? (
                  <ItemBox
                    key={i}
                    item={item}
                    equippedItem={equipment[item.slot]}
                    onClick={() => equipItem(i)}
                  />
                ) : (
                  <div
                    key={i}
                    className="inventory-slot"
                    style={{ width: 36, height: 36 }}
                  />
                )
              ))}
            </div>
            {inventory.some(Boolean) && (
              <div style={{ fontSize: '0.6rem', color: '#666', marginTop: 6 }}>
                Click item to equip. Right-click to sell.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
