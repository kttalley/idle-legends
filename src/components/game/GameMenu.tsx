import React, { useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../../store/gameStore'
import { useDismissable } from '../ui/useDismissable'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { getAudioState, setAmbienceOn, setMuted as audioSetMuted, setMusicOn, setSfxOn, subscribeAudio } from '../../engine/audio/audioEngine'
import { ShopView } from './ShopView'

// The way back to character select.
//
// This is the "Heroes" button that was pulled from the hero strip on 2026-08-09, rebuilt
// with the objection answered rather than reinstated in place. The problem then was never
// that switching characters is unwanted — it was that the control sat between Looks and
// Ladder, styled identically to both, and a mis-tap ended the run behind nothing but a
// `confirm()` dialog. Two things fix that:
//
//   • It lives behind a MENU, not on the strip. Opening a menu is not an action, so a
//     mis-tap on ☰ costs a dismissal and nothing else.
//   • The exit arms itself. The first press turns the row into an explicit question with a
//     Cancel beside it, so leaving is always the second deliberate press.
//
// Nothing here is destructive: `returnToMenu` saves the active run into its slot first, so
// "switch" really is switching and the hero is on the select screen when you get there.

export function GameMenu({ onClose }: { onClose: () => void }) {
  const playerName   = useGameStore(s => s.playerName)
  const playerClass  = useGameStore(s => s.playerClass)
  const level        = useGameStore(s => s.level)
  const returnToMenu = useGameStore(s => s.returnToMenu)

  // 'root' → the list. 'settings' → a sub-page. 'leaving' → the armed exit.
  const [view, setView] = useState<'root' | 'settings' | 'leaving' | 'shop'>('root')
  const surface = useRef<HTMLDivElement>(null)
  useDismissable(true, onClose, { ref: surface, closeOnOutside: true, trapFocus: true })

  // Session-only sound state — it lives in the audio engine, not the persisted save, so
  // a mute set in a quiet room never surprises the player on the next launch.
  const audio = useSyncExternalStore(subscribeAudio, getAudioState)

  const classDef = CLASS_DEFINITIONS[playerClass]

  // Portalled to <body> for the same reason the wardrobe is: the mobile hero drawer
  // animates with `transform`, and a transformed ancestor becomes the containing block for
  // `position: fixed` children — rendered in place this would be clipped to the drawer.
  return createPortal(
    <div
      data-surface="menu"
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + var(--safe-t)) 16px calc(16px + var(--safe-b))',
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="rp-glass"
        style={{ width: 'min(340px, 92vw)', borderRadius: 12, padding: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--gold)' }}>
            {view === 'settings' ? 'Settings' : view === 'shop' ? 'Shop' : 'Menu'}
          </span>
          <span className={classDef.colorClass} style={{ fontSize: '0.6rem' }}>
            {playerName || classDef.name} · Lv {level}
          </span>
        </div>

        {view === 'leaving' && (
          <div>
            <p style={{ fontSize: '0.62rem', color: 'var(--parchment)', margin: '0 0 4px', lineHeight: 1.5 }}>
              Leave {playerName || classDef.name} and pick another hero?
            </p>
            <p style={{ fontSize: '0.58rem', color: '#9a9086', margin: '0 0 12px', lineHeight: 1.5 }}>
              This run is saved first — nothing is lost, and you can come back to it from the
              same screen.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="rp-button"
                onClick={returnToMenu}
                style={{ flex: 1, fontSize: '0.65rem', minHeight: 40 }}
              >
                Save &amp; leave
              </button>
              <button
                className="rp-button"
                onClick={() => setView('root')}
                style={{ flex: 1, fontSize: '0.65rem', minHeight: 40 }}
              >
                Stay
              </button>
            </div>
          </div>
        )}

        {view === 'shop' && <ShopView onBack={() => setView('root')} />}

        {/* Settings. Sound was a lone 🔊 on the hero strip, where it was a fifth control
            crowding four others and reading as navigation. It is a preference, and
            preferences belong behind the menu — with somewhere obvious for the next one to
            go, which a strip of buttons does not have. */}
        {view === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="rp-button menu-row"
              onClick={() => audioSetMuted(!audio.muted)}
              aria-pressed={!audio.muted}
            >
              <span>Sound</span>
              <span className="menu-row-value">{audio.muted ? 'Off' : 'On'}</span>
              <span className="menu-row-note">
                All game audio. Not saved — these reset each launch.
              </span>
            </button>
            <button
              className="rp-button menu-row"
              onClick={() => setMusicOn(!audio.musicOn)}
              aria-pressed={audio.musicOn}
              disabled={audio.muted}
            >
              <span>Music</span>
              <span className="menu-row-value">{audio.musicOn ? 'On' : 'Off'}</span>
            </button>
            <button
              className="rp-button menu-row"
              onClick={() => setSfxOn(!audio.sfxOn)}
              aria-pressed={audio.sfxOn}
              disabled={audio.muted}
            >
              <span>Sound effects</span>
              <span className="menu-row-value">{audio.sfxOn ? 'On' : 'Off'}</span>
            </button>
            <button
              className="rp-button menu-row"
              onClick={() => setAmbienceOn(!audio.ambienceOn)}
              aria-pressed={audio.ambienceOn}
              disabled={audio.muted}
            >
              <span>Ambience</span>
              <span className="menu-row-value">{audio.ambienceOn ? 'On' : 'Off'}</span>
            </button>
            <button
              className="rp-button"
              onClick={() => setView('root')}
              style={{ fontSize: '0.65rem', minHeight: 38 }}
            >
              Back
            </button>
          </div>
        )}

        {view === 'root' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* First row, deliberately. App Review 2.1(b) failed the build twice for
                "the products in the store failed to load" — and the second time the
                reviewer could not find the Standing Orders purchase at all, because its
                only affordance lived inside the Watch meter, which on a phone sits in the
                zone track inside the map modal. A paid app needs ONE obvious place where
                everything purchasable is listed, reachable from anywhere, and it is here. */}
            <button className="rp-button menu-row" onClick={() => setView('shop')}>
              <span>Shop</span>
              <span className="menu-row-note">Founder Pack, Standing Orders, and Restore Purchases</span>
            </button>
            <button className="rp-button menu-row" onClick={() => setView('settings')}>
              <span>Settings</span>
              <span className="menu-row-note">Sound, music and effects</span>
            </button>
            <button className="rp-button menu-row" onClick={() => setView('leaving')}>
              <span>Character Select</span>
              <span className="menu-row-note">Save this run and switch heroes</span>
            </button>
            <button
              className="rp-button"
              onClick={onClose}
              style={{ fontSize: '0.65rem', minHeight: 38 }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
