import { CollapsiblePanel } from '../ui/CollapsiblePanel'
import React, { useState } from 'react'
import { useGameStore, itemColor } from '../../store/gameStore'
import { TooltipWrapper, ItemTooltipContent } from '../ui/Tooltip'
import { DetailSheet, type SheetAction } from '../ui/DetailSheet'
import { SpriteIcon } from '../ui/SpriteIcon'
import type { Item, Slot } from '../../data/types'

/** What the sheet is currently describing: a bag index, or an equipped slot. */
type Inspecting =
  | { kind: 'bag'; index: number }
  | { kind: 'equipped'; slot: Slot }
  | null

const SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']
const SLOT_LABEL: Record<Slot, string> = {
  weapon: 'WPN', helm: 'HLM', chest: 'CHT', legs: 'LGS', boots: 'BTS', trinket: 'TRK',
}

/** Item level → gear-icon material tier. Rarity paints the accents (13–15); the tier
 *  paints the material itself (5–12), so a level-40 common still looks better-made than a
 *  level-2 one. Same four-tier ladder the unit rigs use. */
function gearTier(level: number): string {
  return level < 10 ? 't1' : level < 20 ? 't2' : level < 30 ? 't3' : 't4'
}

function ItemBox({ item, onClick, equippedItem, isEquipped = false }: {
  item: Item
  onClick: () => void
  equippedItem?: Item | null
  isEquipped?: boolean
}) {
  const color = itemColor(item)
  // Hover still gives a mouse user the instant read; the tap target underneath opens
  // the sheet, which is the only path a touch device has to the same information.
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
          padding: 1,
          background: `${color}15`,
          userSelect: 'none',
          touchAction: 'manipulation',
        }}
        onClick={onClick}
        title={item.name}
      >
        <SpriteIcon gear={item.slot} rarity={item.rarity} tier={gearTier(item.level)} size={28} />
      </div>
    </TooltipWrapper>
  )
}

export function InventoryPanel() {
  const {
    inventory, equipment, equipItem, unequipItem, sellItem, sellAllCommon,
    settings, setAutoEquip, setAutoAdvanceZones,
  } = useGameStore()
  const [activeTab, setActiveTab] = useState<'inventory' | 'equipment'>('equipment')
  const [inspecting, setInspecting] = useState<Inspecting>(null)
  const used = inventory.filter(Boolean).length
  const full = used >= inventory.length

  // Resolve whatever the sheet is pointed at into an item plus the actions that make
  // sense for it. Equipping and selling are BUTTONS now — the panel used to advertise
  // "Right-click to sell" with no handler behind it anywhere, so that instruction was
  // never true on any device.
  const inspected: { item: Item; compare: Item | null; actions: SheetAction[] } | null = (() => {
    if (!inspecting) return null
    if (inspecting.kind === 'bag') {
      const item = inventory[inspecting.index]
      if (!item) return null
      return {
        item,
        compare: equipment[item.slot],
        actions: [
          { label: 'Equip', tone: 'primary', onClick: () => equipItem(inspecting.index) },
          // A protected item has no Sell control at all. The store refuses the sale
          // anyway, and a button that silently does nothing is worse than no button —
          // it reads as a bug rather than as protection.
          ...(item.protected ? [] : [
            { label: `Sell — ${item.vendorValue}g`, tone: 'danger' as const,
              onClick: () => sellItem(inspecting.index) },
          ]),
        ],
      }
    }
    const item = equipment[inspecting.slot]
    if (!item) return null
    return {
      item,
      compare: null,
      actions: [
        {
          label: 'Unequip',
          onClick: () => unequipItem(inspecting.slot),
          disabled: full,
          hint: full ? 'No room in your bag' : undefined,
        },
      ],
    }
  })()

  return (
    <CollapsiblePanel id="inventory" title="Inventory" grow>
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: '#3a2c10' }}>
        {(['equipment', 'inventory'] as const).map(t => (
          <button
            key={t}
            className="rp-button flex-1"
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
              Tap a piece to inspect it.
            </div>
            {/* Auto-equip is what makes an unattended hero get stronger at all, so it is
                surfaced here rather than buried — but it stays the player's call. */}
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8,
                fontSize: '0.6rem', color: settings.autoEquip ? '#88ccaa' : '#9d9d9d',
                cursor: 'pointer', userSelect: 'none',
              }}
              title="Wear a drop the moment it beats what you have in that slot. The piece it replaces goes to your bag."
            >
              <input
                type="checkbox"
                checked={settings.autoEquip !== false}
                onChange={e => setAutoEquip(e.target.checked)}
                style={{ accentColor: '#c8a100', width: 11, height: 11 }}
              />
              Auto-equip upgrades
            </label>
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8,
                fontSize: '0.6rem', color: settings.autoAdvanceZones ? '#88ccaa' : '#9d9d9d',
                cursor: 'pointer', userSelect: 'none',
              }}
              title="Move on when the next zone opens, and fall back from one that proves too hard."
            >
              <input
                type="checkbox"
                checked={settings.autoAdvanceZones !== false}
                onChange={e => setAutoAdvanceZones(e.target.checked)}
                style={{ accentColor: '#c8a100', width: 11, height: 11 }}
              />
              Roam onward when ready
            </label>
            {SLOTS.map(slot => {
              const item = equipment[slot]
              const color = item ? itemColor(item) : "#3a2c10"
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
                      onClick={() => setInspecting({ kind: 'equipped', slot })}
                      equippedItem={null}
                    />
                  ) : (
                    <div
                      className="inventory-slot"
                      style={{
                        width: 36, height: 36, border: '1px dashed #3a2c10',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0.28,
                      }}
                      title={`Empty ${slot} slot`}
                    >
                      {/* Dimmed slot art on the neutral item palette — an empty socket that
                          still tells you what belongs in it. */}
                      <SpriteIcon gear={slot} paletteId="item/base" size={24} />
                    </div>
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
              <span style={{ color: full ? '#c8a100' : '#9d9d9d' }}>
                {used} / {inventory.length} slots
              </span>
              <button className="rp-button" style={{ fontSize: '0.6rem' }} onClick={sellAllCommon}>
                Sell Common
              </button>
            </div>
            {/* A full bag no longer eats drops, but it does sell them cheap — say so
                here rather than only in the combat log, which scrolls. */}
            {full && (
              <div style={{ fontSize: '0.55rem', color: '#c8a100', marginBottom: 6 }}>
                Bag full — new drops are being salvaged for a fraction of their worth.
                Buy slots from a town outfitter.
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
              {inventory.map((item, i) => (
                item ? (
                  <ItemBox
                    key={i}
                    item={item}
                    equippedItem={equipment[item.slot]}
                    onClick={() => setInspecting({ kind: 'bag', index: i })}
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
                Tap an item to equip or sell it.
              </div>
            )}
          </div>
        )}
      </div>

      <DetailSheet
        open={!!inspected}
        onClose={() => setInspecting(null)}
        title={inspected && (
          <span style={{ color: itemColor(inspected.item) }}>{inspected.item.name}</span>
        )}
        actions={inspected?.actions}
      >
        {inspected && (
          <ItemTooltipContent item={inspected.item} equippedItem={inspected.compare} hideName />
        )}
      </DetailSheet>
    </CollapsiblePanel>
  )
}
