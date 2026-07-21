// Shared, module-level sprite cache for React UI avatars/preview cards.
// Multiple HeroAvatar cards on the select screen can call getSprite('ffa_soldier')
// and share the same JSON/sheet promise instead of each fetching independently.
// The renderer's combatAdapter has its own spriteCache field; this is the UI-side
// equivalent so components outside the WorldSceneController can render real sprites.

import { loadSpriteOrPlaceholder } from '../../render/indexedSprite'
import { makeHumanoidRig } from '../../render/placeholderArt'
import type { IndexedSprite } from '../../render/types'

const cache = new Map<string, Promise<IndexedSprite>>()

function unitUrl(id: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}local-assets/ffta-scaffold/ffta-units/${id}.json`
}

/** Load (or reuse) an FFTA unit manifest by id. Falls back to the generated
 *  humanoid rig if the scaffold is missing or the file 404s. */
export function getSprite(id: string): Promise<IndexedSprite> {
  const cached = cache.get(id)
  if (cached) return cached
  const promise = loadSpriteOrPlaceholder(unitUrl(id), () => makeHumanoidRig(`rig/${id}`))
  cache.set(id, promise)
  return promise
}

/** Clear the entire cache. Useful for dev HMR or future asset hot-reload. */
export function clearSpriteCache(): void {
  cache.clear()
}
