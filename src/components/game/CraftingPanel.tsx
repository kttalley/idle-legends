import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { RECIPES, MATERIALS, CLASS_PROFESSIONS } from '../../data/professions'
import { HealthBar } from '../ui/HealthBar'
import type { RecipeId } from '../../data/types'

export function CraftingPanel() {
  const {
    playerClass, materials, activeRecipe, craftingTimer, setMode, startCrafting,
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

  const craftPct = selectedRecipe && isCrafting
    ? 1 - craftingTimer / selectedRecipe.craftTime
    : 0

  const effLabel = (recipe: typeof myRecipes[0]) => {
    const eff = recipe.output.effect
    if (eff.type === 'instant_heal')  return `Heal ${eff.value} HP`
    if (eff.type === 'buff_dmg_pct')  return `+${Math.round(eff.value * 100)}% DMG (${eff.durationSeconds}s)`
    if (eff.type === 'buff_armor')    return `+${eff.value} Armor (${eff.durationSeconds}s)`
    if (eff.type === 'buff_crit')     return `+${Math.round(eff.value * 100)}% Crit (${eff.durationSeconds}s)`
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
          {prof.craftIcon} Choose a recipe
        </div>
      </div>

      {/* Recipe list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {myRecipes.map(r => {
          const ok      = canCraft(r.id)
          const isActive = activeRecipe === r.id
          const isSel   = selected === r.id
          return (
            <button
              key={r.id}
              onClick={() => !isCrafting && setSelected(isSel ? null : r.id)}
              disabled={!ok || (isCrafting && !isActive)}
              style={{
                background: isActive ? '#2a1e0a' : isSel ? '#1e2a0a' : '#111',
                border: `1px solid ${isActive ? '#ff8800' : isSel ? '#88aa33' : ok ? '#444' : '#222'}`,
                borderRadius: 4,
                padding: '4px 6px',
                textAlign: 'left',
                cursor: ok && !isCrafting ? 'pointer' : 'default',
                opacity: ok ? 1 : 0.4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: isActive ? '#ffd700' : '#d4b896' }}>
                  {r.output.icon} {r.name}
                </span>
                <span style={{ fontSize: '0.55rem', color: '#888' }}>{r.craftTime}s</span>
              </div>
              {isSel && !isActive && (
                <div style={{ marginTop: 3 }}>
                  <div style={{ fontSize: '0.55rem', color: '#aaa', marginBottom: 2 }}>
                    {r.inputs.map(inp => {
                      const have = materials[inp.materialId] ?? 0
                      const m    = MATERIALS[inp.materialId]
                      return (
                        <span
                          key={inp.materialId}
                          style={{ marginRight: 6, color: have >= inp.qty ? '#88aa33' : '#ff4444' }}
                        >
                          {m.icon} {m.name} {have}/{inp.qty}
                        </span>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '0.55rem', color: '#ffd700' }}>{effLabel(r)}</div>
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
          ⛏ Gather
        </button>
        <button
          className="rp-button"
          onClick={() => setMode('combat')}
          disabled={isCrafting}
          style={{ fontSize: '0.6rem', flex: 1, opacity: isCrafting ? 0.4 : 1 }}
        >
          ⚔ Fight
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
            🔨 Craft!
          </button>
        )}
      </div>
    </div>
  )
}
