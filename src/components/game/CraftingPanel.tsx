import React, { useState } from 'react'
import { useGameStore, rarityColor } from '../../store/gameStore'
import { RECIPES, MATERIALS, CLASS_PROFESSIONS, isGearRecipe, MATERIAL_ZONE } from '../../data/professions'
import { ZONES } from '../../data/zones'
import type { Recipe } from '../../data/professions'
import { HealthBar } from '../ui/HealthBar'
import { SpriteIcon } from '../ui/SpriteIcon'
import { TemperMeter } from './TemperMeter'
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
    setMode, startCrafting, unlockedZones, generatedZoneNames,
  } = useGameStore()

  const [selected, setSelected] = useState<RecipeId | null>(null)

  const prof       = CLASS_PROFESSIONS[playerClass]
  const myRecipes  = RECIPES.filter(r => r.classFor === playerClass)

  // ── Recipes you cannot reach yet, and WHY ─────────────────────────────────
  //
  // Every recipe was shown identically from level 1, so a level-1 alchemist saw the
  // Stillbloom Flask beside the Lesser Healing Draught with nothing to distinguish them but
  // a red material count — no sense of a ladder, and no idea that the difference was forty
  // levels and six zones rather than one more gathering trip.
  //
  // They stay VISIBLE and become locked, which is the same call the action bar makes for
  // an ability slot ("the point of gating is anticipation, which requires seeing the empty
  // chair" — see SkillBar). Locked is keyed on the material's zone rather than on a level
  // number or a new persisted flag: it is the real gate, it needs nothing stored, and it
  // turns a dead entry into a destination — the panel can now finish the sentence the game
  // always knew the answer to, which is where the stuff grows.
  const zoneNameOf = (zoneId: string) =>
    generatedZoneNames[zoneId as keyof typeof generatedZoneNames]
      ?? ZONES[zoneId as keyof typeof ZONES]?.name ?? zoneId
  /** The first input whose source zone is still shut, or null if the recipe is reachable. */
  const gatedBy = (r: Recipe) => {
    for (const inp of r.inputs) {
      const zoneId = MATERIAL_ZONE[inp.materialId]
      if (zoneId && !unlockedZones.includes(zoneId)) {
        return { material: MATERIALS[inp.materialId], zoneId }
      }
    }
    return null
  }

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
        <div style={{ fontSize: '0.65rem', color: 'var(--parchment)', marginTop: 1 }}>
          <SpriteIcon emoji={prof.craftIcon} size={16} /> Choose a recipe
        </div>
        <div style={{ fontSize: '0.52rem', color: '#5a564e', marginTop: 1 }}>
          Output quality is your material quality
        </div>
      </div>

      {/* Recipe list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {myRecipes.map(r => {
          const gate     = gatedBy(r)
          const locked   = gate !== null
          const ok       = !locked && canCraft(r.id)
          const isActive = activeRecipe === r.id
          const isSel    = selected === r.id
          const gear     = isGearRecipe(r)
          const q        = ok ? qualityOf(r) : null
          const qc       = q ? rarityColor(QUALITY_RARITY[q]) : '#666'
          return (
            // A DIV with button semantics, not a <button>. The craft action now lives inside
            // the expanded row (see below) and a <button> inside a <button> is invalid
            // markup that browsers resolve by dropping the inner one.
            <div
              key={r.id}
              role="button"
              tabIndex={ok && !isCrafting ? 0 : -1}
              aria-disabled={!ok || (isCrafting && !isActive)}
              aria-expanded={isSel}
              onClick={() => !locked && ok && !isCrafting && setSelected(isSel ? null : r.id)}
              onKeyDown={e => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                if (!locked && ok && !isCrafting) setSelected(isSel ? null : r.id)
              }}
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
                <span style={{ fontSize: '0.65rem', color: isActive ? 'var(--gold)' : 'var(--parchment)' }}>
                  <SpriteIcon emoji={r.output.icon} size={16} title={r.output.name} /> {r.name}
                  {gear && (
                    <span style={{
                      fontSize: '0.45rem', color: 'var(--gold-soft)', border: '1px solid #6a5a2a',
                      borderRadius: 3, padding: '0 3px', marginLeft: 4, verticalAlign: 'middle',
                    }}>
                      GEAR
                    </span>
                  )}
                </span>
                <span style={{ fontSize: '0.55rem', color: '#888', flexShrink: 0 }}>
                  {locked
                    ? <SpriteIcon ui="lock" size={12} title="Not yet reachable" />
                    : <>
                        {q && <span style={{ color: qc, marginRight: 5 }}>{QUALITY_LABEL[q]}</span>}
                        {r.craftTime}s
                      </>}
                </span>
              </div>
              {/* The whole point of leaving it on screen: it names the thing and the place. */}
              {locked && gate && (
                <div style={{ fontSize: '0.5rem', color: 'var(--muted-warm)', marginTop: 2 }}>
                  <SpriteIcon emoji={gate.material.icon} size={11} /> {gate.material.name} grows in {zoneNameOf(gate.zoneId)} — not open to you yet.
                </div>
              )}
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
                          style={{ marginRight: 6, color: have >= inp.qty ? '#88aa33' : 'var(--danger)' }}
                        >
                          <SpriteIcon emoji={m.icon} size={13} title={m.name} /> {m.name} {have}/{inp.qty}
                          {have > 0 && (
                            <span style={{ color: rarityColor(QUALITY_RARITY[mq]) }}> ({QUALITY_LABEL[mq]})</span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--gold)' }}>{effLabel(r)}</div>
                  {gear && q && !qualityAtLeast(q, 'superior') && (
                    <div style={{ fontSize: '0.5rem', color: '#8a7a4a', marginTop: 2 }}>
                      Work the vein for Superior stock and the hero will auto-forge this.
                    </div>
                  )}
                  {/* The verb, attached to its object. It used to sit in a footer row
                      alongside two mode-navigation buttons, so the one control that was
                      actually this panel's own read as the third of three equals — and it
                      referred to a selection made ten rows further up. Here there is no
                      question what is about to be made. */}
                  <button
                    className="rp-button craft-commit"
                    onClick={e => { e.stopPropagation(); startCrafting(r.id) }}
                    disabled={!canCraft(r.id)}
                    style={{ opacity: canCraft(r.id) ? 1 : 0.45 }}
                  >
                    <SpriteIcon emoji={prof.craftIcon} size={13} />
                    {q ? `Forge · ${QUALITY_LABEL[q]}` : 'Forge'}
                  </button>
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
                  {/* The temper lives with the craft it belongs to, under its own progress
                      bar, for the same reason Forge lives on the recipe: the verb next to
                      its object. */}
                  <TemperMeter />
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
            </div>
          )
        })}
      </div>

      {/* No footer — see the note in GatheringPanel. The two mode-navigation buttons that
          lived here duplicated the action bar, and the Craft button moved up onto the
          recipe it crafts. */}
    </div>
  )
}
