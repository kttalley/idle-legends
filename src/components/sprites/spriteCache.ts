// Shared, module-level sprite cache for React UI avatars/preview cards.
// Multiple HeroAvatar cards on the select screen can call getSprite('ffa_soldier')
// and share the same JSON/sheet promise instead of each fetching independently.
// The renderer's combatAdapter has its own spriteCache field; this is the UI-side
// equivalent so components outside the WorldSceneController can render real sprites.

import { loadSprite, loadSpriteOrPlaceholder } from '../../render/indexedSprite'
import { makeHumanoidRig } from '../../render/placeholderArt'
import { ORIGINAL_SPRITE, useScaffoldArt } from '../../render/adapter/fftaRoster'
import type { IndexedSprite } from '../../render/types'

const cache = new Map<string, Promise<IndexedSprite>>()

/** Load (or reuse) a unit manifest by roster key. DEFAULT = the original Stillmarch rig
 *  (public/sprites/units/) resolved via ORIGINAL_SPRITE; under `?ffta` in a DEV build the
 *  key loads the FFTA scaffold instead. Both fall back to the generated humanoid rig if
 *  the file is missing. Cached by the passed roster key in either mode. */
export function getSprite(id: string): Promise<IndexedSprite> {
  const cached = cache.get(id)
  if (cached) return cached
  const base = import.meta.env.BASE_URL
  const make = () => makeHumanoidRig(`rig/${id}`)
  const promise = useScaffoldArt
    ? loadSpriteOrPlaceholder(`${base}local-assets/ffta-scaffold/ffta-units/${id}.json`, make)
    : (async () => {
        const real = await loadSprite(`${base}sprites/units/${ORIGINAL_SPRITE[id] ?? id}.json`)
        // keep the roster key as the sprite's id so cache key === entity sprite id
        return real ? { ...real, id } : make()
      })()
  cache.set(id, promise)
  return promise
}

/** Clear the entire cache. Useful for dev HMR or future asset hot-reload. */
export function clearSpriteCache(): void {
  cache.clear()
}
