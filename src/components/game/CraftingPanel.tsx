import React, { useState } from 'react'
import { useGameStore, rarityColor } from '../../store/gameStore'
import { RECIPES, MATERIALS, CLASS_PROFESSIONS, isGearRecipe } from '../../data/professions'
import type { Recipe } from '../../data/professions'
import { HealthBar } from '../ui/HealthBar'
import { SpriteIcon } from '../ui/SpriteIcon'
import {
  QUALITY_LABEL, QUALITY_MULT, QUALITY_RARITY, qualityAtLeast, recipeQuality, stockQuality,
} from '../../engine/crafting'
import type { RecipeId } from '../../data/types'

// Crafting is where gathering's quality is spent. The panel's job is to make the trade
// legible: every recipe shows the tier YOUR CURRENT STOCK will produce, so "should I
// burn this Masterwork ore on a potion, or bank it for the battleplate?" is a real
// decision made with full information — no roll, no gamble.

export function CraftingPanel() {
  const {
    playerClass, materials, materialPurity, activeRecipe, craftingTimer, craftQuality,
    setMode, startCrafting,
  } = useGameStore()

  const [selected, setSelected] = useState<RecipeId | null>(null)

  const prof       = CLASS_PROFESSIONS[playerClass]
  const myRecipes  = RECIPES.filter(r => r.classFor === playerClass)

  const canCraft = (recipeId: RecipeId) => {
    const r = myRecipes.find(r => r.id === recipeId)
    if (!r) return false
    return r.inputs.every(inp => (materials[inp.materialId] ?? 0) >= inp.qty)
  }

  const selectedRecipe = selected ? myRecipes.find(r => r.id === selected) ?? null : null
  const isCrafting     = !!activeRecipe

  const activeRecipeDef = activeRecipe ? myRecipes.find(r => r.id === activeRecipe) ?? null : null
  const craftPct = activeRecipeDef && isCrafting
    ? 1 - craftingTimer / activeRecipeDef.craftTime
    : 0

  // What tier this recipe would produce right now, given the stock on hand.
  const qualityOf = (r: Recipe) => recipeQuality(materials, materialPurity, r.inputs)

  const effLabel = (recipe: Recipe) => {
    if (isGearRecipe(recipe) && recipe.gear) {
      const q = qualityOf(recipe)
      return `${QUALITY_LABEL[q]} ${recipe.gear.slot} — equippable`
    }
    const eff = recipe.output.effect
    if (!eff) return ''
    const m = QUALITY_MULT[qualityOf(recipe)]
    const dur = Math.round((eff.durationSeconds ?? 0) * m)
    if (eff.type === 'instant_heal')  return `Heal ${Math.round(eff.value * m)} HP`
    if (eff.type === 'buff_dmg_pct')  return `+${(eff.value * m * 100).toFixed(1)}% DMG (${dur}s)`
    if (eff.type === 'buff_armor')    return `+${Math.round(eff.value * m)} Armor (${dur}s)`
    if (eff.type === 'buff_crit')     return `+${(eff.value * m * 100).toFixed(1)}% Crit (${dur}s)`
    return ''
  }

  return (
    <div className="flex flex-col gap-2 flex-1" style={{ padding: '10px 8px', minHeight: 0 }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
          {prof.craftingName}
        </div>
        <div style={{ fontSize: '0.65rem', color: '#d4b896', marginTop: 1 }}>
          <SpriteIcon emoji={prof.craftIcon} size={16} /> Choose a recipe
        </div>
        <div style={{ fontSize: '0.52rem', color: '#5a564e', marginTop: 1 }}>
          Output quality is your material quality
        </div>
      </div>

      {/* Recipe list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {myRecipes.map(r => {
          const ok       = canCraft(r.id)
          const isActive = activeRecipe === r.id
          const isSel    = selected === r.id
          const gear     = isGearRecipe(r)
          const q        = ok ? qualityOf(r) : null
          const qc       = q ? rarityColor(QUALITY_RARITY[q]) : '#666'
          return (
            <button
              key={r.id}
              onClick={() => !isCrafting && setSelected(isSel ? null : r.id)}
              disabled={!ok || (isCrafting && !isActive)}
              style={{
                background: isActive ? '#2a1e0a' : isSel ? '#1e2a0a' : '#111',
                border: `1px solid ${isActive ? '#ff8800' : isSel ? '#88aa33' : ok ? (gear ? '#6a5a2a' : '#444') : '#222'}`,
                borderRadius: 4,
                padding: '4px 6px',
                textAlign: 'left',
                cursor: ok && !isCrafting ? 'pointer' : 'default',
                opacity: ok ? 1 : 0.4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.65rem', color: isActive ? '#ffd700' : '#d4b896' }}>
                  <SpriteIcon emoji={r.output.icon} size={16} title={r.output.name} /> {r.name}
                  {gear && (
                    <span style={{
                      fontSize: '0.45rem', color: '#c8a864', border: '1px solid #6a5a2a',
                      borderRadius: 3, padding: '0 3px', marginLeft: 4, verticalAlign: 'middle',
                    }}>
                      GEAR
                    </span>
                  )}
                </span>
                <span style={{ fontSize: '0.55rem', color: '#888', flexShrink: 0 }}>
                  {q && <span style={{ color: qc, marginRight: 5 }}>{QUALITY_LABEL[q]}</span>}
                  {r.craftTime}s
                </span>
              </div>
              {isSel && !isActive && (
                <div style={{ marginTop: 3 }}>
                  <div style={{ fontSize: '0.55rem', color: '#aaa', marginBottom: 2 }}>
                    {r.inputs.map(inp => {
                      const have = materials[inp.materialId] ?? 0
                      const m    = MATERIALS[inp.materialId]
                      const mq   = stockQuality(materials, materialPurity, inp.materialId)
                      return (
                        <span
                          key={inp.materialId}
                          style={{ marginRight: 6, color: have >= inp.qty ? '#88aa33' : '#ff4444' }}
                        >
                          <SpriteIcon emoji={m.icon} size={13} title={m.name} /> {m.name} {have}/{inp.qty}
                          {have > 0 && (
                            <span style={{ color: rarityColor(QUALITY_RARITY[mq]) }}> ({QUALITY_LABEL[mq]})</span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '0.55rem', color: '#ffd700' }}>{effLabel(r)}</div>
                  {gear && q && !qualityAtLeast(q, 'superior') && (
                    <div style={{ fontSize: '0.5rem', color: '#8a7a4a', marginTop: 2 }}>
                      Work the vein for Superior stock and the hero will auto-forge this.
                    </div>
                  )}
                </div>
              )}
              {isActive && (
                <div style={{ marginTop: 4 }}>
                  <HealthBar
                    current={craftPct * 100}
                    max={100}
                    type="xp"
                    height={6}
                    showText={false}
                  />
                  <div style={{ fontSize: '0.5rem', color: '#888', marginTop: 1 }}>
                    {craftingTimer.toFixed(1)}s remaining
                    {craftQuality && (
                      <span style={{ color: rarityColor(QUALITY_RARITY[craftQuality]), marginLeft: 5 }}>
                        → {QUALITY_LABEL[craftQuality]}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Craft / nav buttons */}
      <div className="flex gap-2">
        <button
          className="rp-button"
          onClick={() => setMode('gathering')}
          disabled={isCrafting}
          style={{ fontSize: '0.6rem', flex: 1, opacity: isCrafting ? 0.4 : 1 }}
        >
          <SpriteIcon emoji="⛏" size={13} /> Gather
        </button>
        <button
          className="rp-button"
          onClick={() => setMode('combat')}
          disabled={isCrafting}
          style={{ fontSize: '0.6rem', flex: 1, opacity: isCrafting ? 0.4 : 1 }}
        >
          <SpriteIcon emoji="⚔" size={13} /> Fight
        </button>
        {selected && !isCrafting && (
          <button
            className="rp-button"
            onClick={() => { startCrafting(selected); }}
            disabled={!canCraft(selected)}
            style={{
              fontSize: '0.6rem', flex: 1,
              background: canCraft(selected) ? '#3a2800' : undefined,
              opacity: canCraft(selected) ? 1 : 0.4,
            }}
          >
            <SpriteIcon emoji="🔨" size={13} /> Craft{selectedRecipe && canCraft(selectedRecipe.id)
              ? ` ${QUALITY_LABEL[qualityOf(selectedRecipe)]}`
              : '!'}
          </button>
        )}
      </div>
    </div>
  )
}
