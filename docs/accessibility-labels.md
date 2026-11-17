# Accessibility Nutrition Labels: audit (2026-11-16)

App Store Connect currently declares no accessibility features. This is a code audit against
Apple's label categories. Apple's bar: declare a feature only if a user can complete the app's
**common tasks** with it. For Stillmarch those are: create a character, pick a route and send the
hero out, collect offline progress, equip gear, spend talent points, use the shop, and use the
ladder (publish, challenge, report).

Nothing here was tested on a device with the feature turned on. "Supported" below means the code
supports it; confirm on a phone before declaring.

| Category | Verdict | Declare now? |
|---|---|---|
| VoiceOver | Partially supported | No |
| Voice Control | Partially supported | No |
| Larger Text | Not supported | No |
| Dark Interface | Supported | Yes, after a quick device check |
| Differentiate Without Color Alone | Partially supported | No |
| Sufficient Contrast | Supported for UI text | Yes, after checking text over the world scene |
| Reduced Motion | Partially supported | No |
| Captions | Not applicable | No (no spoken or video content) |
| Audio Descriptions | Not applicable | No (no video content) |

## Evidence

**VoiceOver: partially supported.** The menus, shop, gear, talents and ladder are React DOM with
real `<button>` elements (113 of them; only 1 clickable `div`/`span`), and 30 `aria-label`s plus
12 `role=` attributes. But the world itself renders to `<canvas>` (6 canvas elements, 10 files using
a 2D context), which VoiceOver can't read, and there are no `aria-live` regions, so combat results,
loot and offline-progress summaries aren't announced. Images have no `alt` text (0 uses), though
most art is drawn on canvas rather than in `<img>`.
- Quick wins: add an `aria-live="polite"` region that announces loot, level-ups and the offline
  summary; give the canvas a text alternative (a short live description of the hero's current
  zone and activity); audit icon-only buttons for labels; test the seven common tasks with
  VoiceOver on a device.

**Voice Control: partially supported.** Voice Control needs every control to have a visible or
accessible name. Most buttons have visible captions (`App.tsx` and `ActionBar.tsx` comments note
the mode buttons have an icon over a caption), and icon controls carry `aria-label`. Anything
tapped directly on the canvas (if a common task needs a world tap) can't be named.
- Quick win: confirm no common task requires tapping the canvas; if one does, add a DOM button for it.

**Larger Text: not supported.** The viewport disables zoom (`user-scalable=no, maximum-scale=1.0`
in `index.html`), there is no Dynamic Type hook (no `-apple-system-body`, no Capacitor
`text-zoom` plugin), and 23 font sizes are fixed in `px` (105 use rem or Tailwind sizes, which
still won't follow iOS text size inside a WKWebView by default).
- Quick win: add `@capacitor/text-zoom` and apply the system text-size preference at startup, or
  set the root font with `font: -apple-system-body` and size text in `rem`. Then check layouts at
  the largest sizes, since the HUD is dense.

**Dark Interface: supported.** The whole app is dark by default: `body { background-color:
#1a1510 }` with light parchment and gold text, and there is no light theme to fall back to. Apple
accepts a dark-by-default app. Check the terms and privacy screens (`TermsGate`, `privacy.html`,
`terms.html`) are dark too before declaring.

**Differentiate Without Color Alone: partially supported.** Faction is shown by name color
(`FACTION_NAME_COLOR` in `src/data/factions.ts`: Concord blue, Ashmarch red, unaligned gold). In
character select the faction name is also written out as text (`CharacterSelect.tsx` lines
113-114), but in-world nameplates and hostile/friendly cues appear to rely on color.
- Quick win: add a small faction glyph or text tag to nameplates and anywhere hostile vs friendly
  is shown by color only.

**Sufficient Contrast: supported for UI text.** Measured against the body background `#1a1510`:
parchment body text 9.6:1, gold 12.9:1, gold-soft 8.0:1, muted 6.7:1, muted-warm 4.7:1 (the lowest;
still above WCAG's 4.5:1), success 9.7:1, warn 7.2:1, danger 5.3:1, faction blue 9.5:1, faction
red 7.9:1. Not measured: text drawn over the world scene (nameplates, floating damage numbers),
where the background varies by biome.
- Check: screenshot nameplates over the brightest biomes and confirm they have an outline or
  backing plate.

**Reduced Motion: partially supported.** Six `@media (prefers-reduced-motion: reduce)` blocks in
`src/index.css` cover CSS animations, but no TypeScript reads `matchMedia('(prefers-reduced-motion:
reduce)')`, so canvas effects (camera moves, combat effects, floating numbers) keep animating.
- Quick win: read the preference once in the renderer and turn off camera easing, screen shake
  and particle bursts when it's set.

**Captions and Audio Descriptions: not applicable.** The only audio is music and sound effects
(`src/engine/audio/`); there is no spoken dialogue and no video. Apple's captions and audio
description labels are for apps with that kind of content, so leave both undeclared.

## Suggested order

1. Declare **Dark Interface** and **Sufficient Contrast** after the two device checks above.
2. Reduced Motion (renderer flag) and Differentiate Without Color (nameplate tags) are small and
   would move two more categories to supported.
3. Larger Text and VoiceOver are the bigger pieces of work.
