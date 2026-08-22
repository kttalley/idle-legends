import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useGameStore } from './store/gameStore'
import { startGameLoop, stopGameLoop } from './engine/gameLoop'
import { CharacterCreate } from './components/game/CharacterCreate'
import { CharacterSelect } from './components/game/CharacterSelect'
import { CloudSaveNotice } from './components/game/CloudSaveNotice'
import { CombatView } from './components/game/CombatView'
import { CharacterPanel } from './components/game/CharacterPanel'
import { InventoryPanel } from './components/game/InventoryPanel'
import { ZoneTrack } from './components/game/ZoneTrack'
import { HeroBar } from './components/game/HeroBar'
import { CombatLog } from './components/game/CombatLog'
import { ChatPanel } from './components/game/ChatPanel'
import { PartyChatPanel } from './components/game/PartyChatPanel'
import { getParty, subscribeParty } from './engine/party'
import { PlayerCard } from './components/game/PlayerCard'
import { WhisperWindow } from './components/game/WhisperWindow'
import { installViewportInsets } from './engine/viewportInsets'
import { deleteCloudSlot, installCloudSaveFlush } from './net/cloudSave'
import { scheduleWatchEnd, cancelWatchEnd } from './engine/watchNotifications'
import { watchCapacitySeconds } from './engine/offline'
import { compileUpgrades } from './data/upgrades'
import { compileUniques } from './data/uniques'
import { getPurchaseState, purchasedWatchHours } from './monetization/purchases'
import { useDismissable } from './components/ui/useDismissable'
import { QuestToast } from './components/game/QuestToast'
import { OfflineReportToast } from './components/game/OfflineReportToast'
import { CraftResultToast } from './components/game/CraftResultToast'
import { LevelUpToast } from './components/game/LevelUpToast'
import { slotStorage, getLastSlotId, setLastSlotId } from './store/saveSlots'
import type { SaveSlotMeta } from './store/saveSlots'
import { initAudio, setZone as audioSetZone, setVolume as audioSetVolume, setWeather as audioSetWeather } from './engine/audio/audioEngine'
import {
  initGenerative, setGenerativeZone, updateWorldSignals, playStinger,
  startGenerative, stopGenerative,
} from './engine/audio/generativeEngine'
import { ZONES, ZONE_ORDER } from './data/zones'
import { SpriteIcon } from './components/ui/SpriteIcon'
import { formatGold } from './components/ui/GoldDisplay'

const SHOW_DEV_JUMP = new URLSearchParams(window.location.search).has('dev')

// ── One panel metaphor, both breakpoints ──────────────────────────────────────
//
// This used to be two independent state machines: `activePanel` (mobile drawers, closed
// with a ✕) and `collapsed` (desktop rails, folded with a ‹/›). They were never mutually
// exclusive, and `.rail-minimize` was not hidden below 900px, so a mobile drawer rendered
// BOTH controls — and because `.app-sidebar-left.collapsed` (0,2,0) outranks the mobile
// `.app-sidebar-left` rule (0,1,0), tapping ‹ inside a drawer applied `width: 34px` and
// hid the body. The result was a 34px strip of empty glass that was still "open": scrim
// up, dock button lit, content gone.
//
// Now there is one concept. A panel is EXTENDED or RETRACTED, it carries exactly one
// control (minimize, in its own head), and what "retracted" looks like is the only thing
// the breakpoint decides:
//
//   desktop — a 34px stub at the screen edge, with the restore arrow on it
//   mobile  — off-screen entirely; the dock button IS the restore control
//
// So minimize and close stop being different verbs. There is no ✕ anywhere.
type PanelId = 'hero' | 'log' | 'bag'
type PanelState = Record<PanelId, boolean>

const NARROW_QUERY = '(max-width: 899px)'
const isNarrow = () =>
  typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches

/**
 * Only the DEFAULT differs by width, not the model.
 *
 * On desktop the rails are furniture and start extended. On a phone they are overlays on
 * top of the world, so starting them extended would open the app with the game hidden
 * behind three panels.
 */
function defaultPanels(narrow: boolean): PanelState {
  return narrow
    ? { hero: false, log: false, bag: false }
    : { hero: true, log: true, bag: true }
}

// ── Audio signal helpers ──────────────────────────────────────────────────────────────
// Pure projections of store state into the slices the generative engine listens to. Kept here
// (not in the engine) so the engine stays free of store knowledge and headless-safe.
type StoreState = ReturnType<typeof useGameStore.getState>
const clamp01v = (v: number) => Math.max(0, Math.min(1, v))
const clampv = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Non-tile world signals: how busy the world is, what mode, whether a boss is up, the weather,
 *  and how out-of-depth the player is. Pushed to the generative engine on change. */
function worldSignals(s: StoreState) {
  const range = ZONES[s.currentZone]?.levelRange
  const danger = range && s.level < range[0] ? clamp01v((range[0] - s.level) / 8) : 0
  return {
    entityCount: s.mobs.length + s.allies.length,
    gameMode: s.gameMode,
    boss: !!s.currentMob?.isBoss,
    weather: s.weatherState.type,
    danger,
  }
}

/** Tile-reactivity: histogram the ground under a radius around the player and translate it
 *  into register/tension/density nudges. Returns null when there is no map to read yet. */
function tileSignals(s: StoreState): { registerShift: number; tensionAdd: number; densityMul: number } | null {
  const map = s.zoneMaps[s.currentZone]
  const tiles = map?.tiles
  if (!tiles) return null
  const R = 6
  const cx = Math.round(s.playerMapPos.x), cy = Math.round(s.playerMapPos.y)
  const counts: Record<string, number> = {}
  let total = 0
  for (let dy = -R; dy <= R; dy++) {
    const r = cy + dy
    if (r < 0 || r >= tiles.length) continue
    const row = tiles[r]
    for (let dx = -R; dx <= R; dx++) {
      const c = cx + dx
      if (c < 0 || c >= row.length) continue
      const t = row[c]?.type
      if (!t) continue
      counts[t] = (counts[t] ?? 0) + 1
      total++
    }
  }
  if (!total) return null
  const frac = (k: string) => (counts[k] ?? 0) / total
  const water = frac('water'), ember = frac('ember'), rock = frac('rock')
  const flower = frac('flower'), moss = frac('moss'), grass = frac('grass'), cliff = frac('cliff')
  return {
    registerShift: clampv(12 * water - 12 * (ember + rock), -12, 12),
    tensionAdd: clamp01v(0.4 * (ember + rock) + 0.2 * cliff),
    densityMul: clampv(1 + 0.3 * (flower + moss + grass) - 0.3 * water, 0.4, 1.6),
  }
}

export default function App() {
  const initialized  = useGameStore(s => s.initialized)
  const initGame     = useGameStore(s => s.initGame)
  const loadSlot     = useGameStore(s => s.loadSlot)
  const gold         = useGameStore(s => s.gold)
  const currentZone  = useGameStore(s => s.currentZone)
  const devJumpZone  = useGameStore(s => s.devJumpZone)
  const talentPoints = useGameStore(s => s.talentPoints)

  const [panels, setPanels] = useState<PanelState>(() => defaultPanels(isNarrow()))
  const [logTab, setLogTab] = useState<'combat' | 'chat' | 'party'>('chat')

  // Party size gates the PARTY tab: with no party there is no group chat. Subscribed
  // directly so a join/disband re-renders the tab row without going through the store.
  const partySize = useSyncExternalStore(subscribeParty, () => getParty().length)
  // If the party disbands while the PARTY tab is active, fall back to CHAT so the
  // panel does not sit on an empty notice until the next user click.
  useEffect(() => {
    if (partySize === 0 && logTab === 'party') setLogTab('chat')
  }, [partySize, logTab])

  // Crossing the breakpoint re-seeds the defaults. Without this, rotating a tablet from
  // portrait to landscape carries the phone's "everything retracted" state into a desktop
  // layout that has no dock to reopen anything from — the panels would be unreachable.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = (e: MediaQueryListEvent) => setPanels(defaultPanels(e.matches))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Publish the iOS keyboard height as --kb-inset so fixed panels can ride above it.
  useEffect(installViewportInsets, [])

  // Push the last save up before the app goes away. `queueCloudSave` throttles uploads to
  // one a minute during play, so without this the final minute of a session — the part a
  // player is most likely to notice missing — would be the part most likely to be lost.
  // Listens on `visibilitychange`/`pagehide` rather than `beforeunload`, which mobile
  // browsers routinely skip when killing a backgrounded tab.
  useEffect(installCloudSaveFlush, [])

  // ── The watch notification ───────────────────────────────────────────────────────
  //
  // Scheduled when the app goes to the BACKGROUND, because that is the only moment the
  // length of the coming absence is knowable — the watch is base + permanent ranks +
  // whatever is banked right now, and all three change during play. Cancelled on return,
  // since a pending notice can then only fire wrongly.
  //
  // `visibilitychange` rather than a Capacitor App listener: it fires in WKWebView and in
  // a browser tab alike, so the same code path is exercised in dev (where it no-ops on the
  // native guard) as in the shipped app.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { void cancelWatchEnd(); return }
      const s = useGameStore.getState()
      if (!s.initialized) return
      const permanentHours =
        compileUpgrades(s.upgradeRanks).offlineHours +
        compileUniques(s.equipment).offlineHours +
        purchasedWatchHours(getPurchaseState().active)
      void scheduleWatchEnd(watchCapacitySeconds(s, permanentHours).total)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── Procedural audio ─────────────────────────────────────────────────────────────
  //
  // iOS WKWebView only resumes an AudioContext off a user gesture, so the context is latched
  // on the first pointerdown/keydown (the Continue/Create tap is the natural one). After that
  // a single store subscription drives BOTH audio layers: the ambient bed (zone crossfade,
  // volume, weather) and the generative music (zone grammar + live world signals). The
  // generative layer's tile-reactivity runs on its own 0.5 s sampler below. No per-frame work —
  // both engines modulate parameters on transitions only (see audioEngine/generativeEngine).
  useEffect(() => {
    let latched = false
    const latch = () => {
      if (latched) return
      latched = true
      initAudio()
      const s = useGameStore.getState()
      audioSetVolume(s.settings.volume)
      audioSetWeather(s.weatherState.type)
      if (s.initialized) {
        audioSetZone(s.currentZone, s.worldSeed)
        // Tone.js is dynamically imported inside initGenerative; chain the zone grammar on so
        // the cells come up reading the right scale/tempo the moment they exist.
        void initGenerative().then(() => {
          setGenerativeZone(s.currentZone, s.worldSeed)
          updateWorldSignals(worldSignals(s))
          startGenerative()
        })
      }
      window.removeEventListener('pointerdown', latch)
      window.removeEventListener('keydown', latch)
    }
    window.addEventListener('pointerdown', latch)
    window.addEventListener('keydown', latch)
    return () => {
      window.removeEventListener('pointerdown', latch)
      window.removeEventListener('keydown', latch)
    }
  }, [])

  useEffect(() => {
    // Tracks how much of combatLog we have already sonified, so only NEW entries fire stingers.
    let lastLogLen = 0
    // Diff only the slices the engines care about; everything else is ignored so combat ticks
    // (which fire this callback constantly) never reach Web Audio.
    const onStore = (state: ReturnType<typeof useGameStore.getState>, prev: typeof state) => {
      if (state.initialized && !prev.initialized) {
        audioSetZone(state.currentZone, state.worldSeed)
        audioSetVolume(state.settings.volume)
        audioSetWeather(state.weatherState.type)
        lastLogLen = state.combatLog.length
        void initGenerative().then(() => {
          setGenerativeZone(state.currentZone, state.worldSeed)
          updateWorldSignals(worldSignals(state))
          startGenerative()
        })
        return
      }
      if (!state.initialized) {
        stopGenerative()
        lastLogLen = 0
        return
      }
      if (state.currentZone !== prev.currentZone) {
        audioSetZone(state.currentZone, state.worldSeed)
        setGenerativeZone(state.currentZone, state.worldSeed)
        updateWorldSignals(worldSignals(state))
      }
      if (state.settings.volume !== prev.settings.volume) audioSetVolume(state.settings.volume)
      if (state.weatherState.type !== prev.weatherState.type) {
        audioSetWeather(state.weatherState.type)
        updateWorldSignals({ weather: state.weatherState.type })
      }

      // Generative reactivity: only when a watched slice actually changes (these change on
      // spawns/deaths/transitions, not every tick) do we push new signals to the music.
      const a = worldSignals(state), b = worldSignals(prev)
      if (a.entityCount !== b.entityCount || a.gameMode !== b.gameMode ||
          a.boss !== b.boss || a.danger !== b.danger) {
        updateWorldSignals(a)
      }

      // Combat-log stinger tail: sonify level-ups, boss spawns, and mob deaths as the log grows.
      const log = state.combatLog
      if (log.length !== lastLogLen) {
        if (log.length > lastLogLen) {
          for (let i = lastLogLen; i < log.length; i++) {
            const t = log[i].type
            if (t === 'level_up') playStinger('level_up')
            else if (t === 'boss_spawn') playStinger('boss_spawn')
            else if (t === 'mob_death') playStinger('mob_death')
          }
        }
        lastLogLen = log.length
      }
    }
    return useGameStore.subscribe(onStore)
  }, [])

  // Tile-reactivity sampler: every 0.5 s, histogram the tile types under a radius around the
  // player and retune the generative grammar — water lifts and thins it, ember/rock drop and
  // darken it, flowers/moss thicken it. This is the "walking changes the music" channel; it is
  // deliberately off the per-tick store subscription so it never competes with the render loop.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useGameStore.getState()
      if (!s.initialized) return
      const ts = tileSignals(s)
      if (ts) updateWorldSignals(ts)
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  // Publish whatever occupies the foot of the left column as --log-h.
  //
  // The left rail's max-height subtracts --log-h so the column stops where the chat
  // panel starts. That number was hand-kept in :root at 220px, matching a `height` set
  // in a different rule two hundred lines away — change one and the rail silently
  // mis-sizes, either overlapping the chat or leaving a band of dead space above it.
  // Measuring it means the coupling cannot drift. (Mobile ignores the variable: the rail
  // is a drawer capped against the dock there, and the log is a floating sheet.)
  //
  // Which ELEMENT gets measured now depends on whether the feed is extended, because on
  // desktop a retracted feed leaves the chat button in its place — a 44px control, not a
  // 220px panel. Measuring the panel unconditionally would reserve the whole feed's
  // height for a button and strand the rail 180px short of the bottom of the screen.
  const logRef = useRef<HTMLDivElement>(null)
  const logFabRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el: HTMLElement | null = panels.log ? logRef.current : logFabRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const publish = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) document.documentElement.style.setProperty('--log-h', `${Math.round(h)}px`)
    }
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    publish()
    return () => ro.disconnect()
  }, [initialized, panels.log])
  const [slots, setSlots]   = useState<SaveSlotMeta[]>(() => slotStorage.list())
  // Show creation directly when there are no heroes yet; otherwise the select screen.
  const [creating, setCreating] = useState<boolean>(() => slotStorage.list().length === 0)

  // Boot resume — the fix for "the app spontaneously returns to character select".
  //
  // It was never a reset; it was a MISSING RESUME. Commit 11966fe (save slots) replaced
  // loadGame() with loadSlot(id) and deleted the `useEffect(() => loadGame(), [])` that
  // used to run on mount, without replacing it — leaving loadSlot reachable from exactly
  // one place in the app, a human clicking Continue. The save on disk was fine the whole
  // time; nothing ever went back for it. So any re-evaluation of the gameStore module
  // lands on a fresh defaultState() with no way back: in dev that is Vite's HMR (
  // gameStore is not a Fast Refresh boundary, so it re-executes in place and the app
  // blinks to the menu mid-session with nothing in the console), and in a shipped
  // WKWebView it is a memory-pressure reload dumping the player at the menu mid-run.
  //
  // The ref guards against StrictMode's double-mount, which would otherwise run the
  // offline-progress projection in loadSlot twice.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    const last = getLastSlotId()
    if (!last) return
    // A stale pointer (hero deleted on another tab) must not be retried forever.
    if (!loadSlot(last)) setLastSlotId(null)
  }, [loadSlot])

  /**
   * The only mutation. On a phone the panels are overlays stacked on one screen, so
   * extending one retracts the rest; on desktop they are columns that coexist.
   */
  const toggle = useCallback((id: PanelId) => {
    setPanels(cur => {
      const next = !cur[id]
      if (next && isNarrow()) return { ...defaultPanels(true), [id]: true }
      return { ...cur, [id]: next }
    })
  }, [])

  /** Retract everything. A no-op on desktop, where nothing is covering the world. */
  const close = useCallback(() => {
    setPanels(cur => (isNarrow() ? defaultPanels(true) : cur))
  }, [])

  // The drawers are menus and keep the same contract as every other surface — see
  // ui/useDismissable. Registering them on the shared stack rather than hanging a handler
  // on the scrim is what makes the nested case work: the wardrobe is PORTALLED out of the
  // drawer that raised it, so a press inside the modal is geometrically outside the
  // drawer, and a local handler would dismiss the drawer the moment you touched it.
  //
  // No focus trap. The dock sits below the scrim and stays tappable on purpose — a drawer
  // here is a panel you switch away from, not a modal that owns the screen.
  const heroDrawer = useRef<HTMLDivElement>(null)
  const bagDrawer = useRef<HTMLDivElement>(null)
  // Only relevant on a phone, where an extended panel is an overlay with a scrim. On
  // desktop the rails are columns and `close` is a no-op, so registering them is harmless.
  const narrow = isNarrow()
  const openDrawer = narrow && panels.hero ? heroDrawer
    : narrow && panels.bag ? bagDrawer
    : undefined
  // The dock is EXEMPT from outside-dismissal. It is this drawer's restore control, so a
  // press on it is using the panel's own chrome, not tapping away from it — and treating it
  // as "outside" made the tab bar one-way: pointerdown retracted the drawer, then the
  // button's click saw a closed panel and extended it again.
  useDismissable(openDrawer != null, close, { ref: openDrawer, closeOnOutside: true, exempt: '.app-dock' })
  // Chat is the exception, and deliberately so: it has no scrim, because this is an idle
  // game you watch and a scrim would grey out the world you are chatting about. Its
  // "outside" is the world itself, handled on `.app-world` below — tapping the HUD while
  // reading chat is using a control, not tapping away.
  useDismissable(narrow && panels.log, close)

  const refreshSlots = () => setSlots(slotStorage.list())

  // `panel-open` and `collapsed` are now strictly complementary — a panel always carries
  // exactly one of them, at every breakpoint. (Both class names are kept: the UI suites
  // key off `panel-open` as the "extended" marker, and `collapsed` already carries the
  // desktop stub styling.)
  const panelClass = (base: string, id: PanelId) =>
    `${base} rp-glass ${panels[id] ? 'panel-open' : 'collapsed'}`

  useEffect(() => {
    if (initialized) {
      startGameLoop()
    } else {
      stopGameLoop()
      // Back at the menu — resync the slot list and reset creation state.
      const list = slotStorage.list()
      setSlots(list)
      setCreating(list.length === 0)
    }
    return () => stopGameLoop()
  }, [initialized])

  if (!initialized) {
    if (creating) {
      return (
        <CharacterCreate
          onCreate={(cls, race, opts) => initGame(cls, race, opts)}
          onBack={slots.length > 0 ? () => setCreating(false) : undefined}
        />
      )
    }
    return (
      <CharacterSelect
        slots={slots}
        onContinue={(id) => loadSlot(id)}
        onCreate={() => setCreating(true)}
        onDelete={(id) => {
          slotStorage.delete(id)
          // Delete the backup too, or the cloud-save notice restores it on the very next
          // visit to this screen and the character becomes undeletable.
          void deleteCloudSlot(id)
          refreshSlots()
        }}
        // Restores anything the cloud has that this device does not, and offers (never
        // applies) a cloud save that is further along. Lives on the select screen because
        // that is the only moment a restore cannot land on top of a run in progress.
        banner={<CloudSaveNotice onSlotsChanged={refreshSlots} />}
      />
    )
  }

  return (
    <div
      className="app-root"
      data-left-collapsed={String(!panels.hero)}
      data-right-collapsed={String(!panels.bag)}
    >
      {/* The world, full-bleed. Everything below floats on top of it. */}
      {/* Tapping the world dismisses the chat sheet. Chat is the one panel with no
          scrim — a scrim would grey out the world you are chatting about and swallow the
          action bar — so "tap outside to close" has to come from the world itself. The
          HUD is excluded: using an ability or opening the minimap while reading chat is
          not tapping away from it.

          The tap is NOT swallowed, so the hero still walks where you pointed. That is the
          same call the target card makes (see PlayerCard) and the MMO convention: you
          click away, your character goes there, and the thing you clicked away from
          closes behind you. */}
      <div
        className="app-world"
        onPointerDown={e => {
          if (!(isNarrow() && panels.log)) return
          if ((e.target as HTMLElement).closest('.hud-layer')) return
          close()
        }}
      >
        <CombatView />
      </div>

      <QuestToast />
      <OfflineReportToast />

      {/* ── Left: hero strip / character / zone track ──
          Three bands, not one scrolling stack. The hero strip and the zone track are
          navigation and stay pinned; only the character sheet — the section that grows
          without bound as talents and stats accumulate — scrolls. The zone track sits at
          the FOOT because it reads as the ground the hero is standing on, and because it
          is now short enough that the sheet above it no longer has to be folded away. */}
      <div ref={heroDrawer} className={panelClass('app-sidebar-left', 'hero')}>
        {/* Retracted, this head is the whole panel: a hero button to bring the sheet back
            and the menu beside it. The old ‹/› arrows were a poor fit once the rail became
            a stacked column rather than a sliding edge — an arrow points somewhere, and
            these do not travel sideways any more. Open, the control is a plain ✕ (it
            closes); closed, it is the thing it reopens. */}
        <div className="rail-head">
          <HeroBar />
          <button
            className="rail-minimize"
            onClick={() => toggle('hero')}
            title={panels.hero ? 'Close character panel' : 'Show character panel'}
            aria-label={panels.hero ? 'Close character panel' : 'Show character panel'}
            aria-expanded={panels.hero}
          >
            {panels.hero ? '✕' : <><SpriteIcon ui="menu" size={14} /><span className="rail-restore-label">Menu</span></>}
          </button>
        </div>
        <div className="rail-body">
          <CharacterPanel />
          {SHOW_DEV_JUMP && (
            <select
              value={currentZone}
              onChange={e => devJumpZone(e.target.value as typeof currentZone)}
              title="DEV: jump to biome"
              className="rp-button"
              style={{ fontSize: '0.55rem', padding: '2px 4px' }}
            >
              {ZONE_ORDER.map(z => (
                <option key={z} value={z}>{ZONES[z]?.name ?? z}</option>
              ))}
            </select>
          )}
        </div>
        <div className="rail-foot">
          {/* Ordering a journey finishes what the drawer was opened for, so on a phone the
              drawer gets out of the way and lets you watch it. `close()` is a no-op on
              desktop, where the rail is permanent and nothing was covering anything. */}
          <ZoneTrack onTravel={close} />
        </div>
      </div>
      {/* ── Right: inventory ── */}
      <div ref={bagDrawer} className={panelClass('app-sidebar-right', 'bag')}>
        {/* The rail's head IS the panel's title bar now. InventoryPanel used to wrap itself
            in a CollapsiblePanel whose only job was to print "Gear" and fold a section that
            was the entire contents of the rail — a second collapse control for the same
            thing, one row below the first. */}
        <div className="rail-head">
          <span className="rail-title">Gear</span>
          <button
            className="rail-minimize"
            onClick={() => toggle('bag')}
            title={panels.bag ? 'Close inventory' : 'Show inventory'}
            aria-label={panels.bag ? 'Close inventory' : 'Show inventory'}
            aria-expanded={panels.bag}
          >
            {/* Collapsed, this button is the only thing left of the rail, so it says what
                it reopens — the same treatment the character rail's "Menu" gets. An
                unlabelled bag glyph on a 62px stub is a guess, not a control. */}
            {/* Sword, not a bag — the same swap the dock's Gear button makes. This rail is
                what you fight with; the backpack glyph belonged to the old "Inventory"
                framing and the two breakpoints have to show one control, not two. */}
            {panels.bag ? '✕' : <><SpriteIcon emoji="⚔" size={15} /><span className="rail-restore-label">Gear</span></>}
          </button>
        </div>
        <div className="rail-body">
          <InventoryPanel />
        </div>
      </div>

      {/* ── Combat log / zone chat ── */}
      {/* Two feeds share one slot: what happened TO you, and what the world is saying
          around you. The ladder briefly lived here as a third tab and was moved out — it is
          a section with its own sub-views, not a feed, and this slot is a feed. */}
      <div ref={logRef} className={`app-log rp-glass${panels.log ? ' panel-open' : ''}`}>
        <div className="app-log-tabs">
          <button
            className={`app-log-tab${logTab === 'combat' ? ' is-active' : ''}`}
            onClick={() => setLogTab('combat')}
          >COMBAT</button>
          <button
            className={`app-log-tab${logTab === 'chat' ? ' is-active' : ''}`}
            onClick={() => setLogTab('chat')}
          >CHAT</button>
          {/* Party tab — sits next to CHAT, disabled when the player has no party. The
              panel itself shows an empty-party notice when reached, but greying the
              button up front keeps the affordance honest: a tab you cannot use should
              not look like one you can. */}
          <button
            className={`app-log-tab${logTab === 'party' ? ' is-active' : ''}`}
            onClick={() => setLogTab('party')}
            disabled={partySize === 0}
            title={partySize === 0 ? 'Invite a hero to your party to enable party chat' : 'Party chat'}
            aria-label="Party chat"
          >PARTY</button>
          {/* The feed folds away like the rails do, and carries the same single control in
              its own head. It was the one panel on desktop with no way to dismiss it: the
              world is the thing you are here to watch, and a permanent 232px feed over the
              bottom-left corner of it is furniture the player never agreed to. */}
          <button
            className="rail-minimize app-log-minimize"
            onClick={() => toggle('log')}
            title="Close chat"
            aria-label="Close chat"
            aria-expanded={panels.log}
          >✕</button>
        </div>
        <div className="app-log-content">
          {logTab === 'combat' ? <CombatLog />
            : logTab === 'party' ? <PartyChatPanel />
            : <ChatPanel />}
        </div>
      </div>
      {/* Restore control for the folded feed — a floating chat button standing exactly
          where the panel's own corner was, so it expands back out of the thing you
          pressed. Desktop only: on a phone the dock button is already the way back, and
          the model there is one panel at a time (see `toggle`). */}
      <button
        ref={logFabRef}
        className={`app-log-fab${panels.log ? '' : ' is-visible'}`}
        onClick={() => toggle('log')}
        title="Show chat"
        aria-label="Show chat"
        aria-expanded={panels.log}
      >
        <SpriteIcon ui="chat" size={20} />
      </button>

      {/* Target card for a tapped hero, and the whisper conversation it can open.
          Both are fixed overlays so they work identically at every breakpoint — in
          particular they do NOT depend on the mobile log sheet being open. */}
      <PlayerCard />
      <WhisperWindow />

      {/* ── Mobile dock ──
          The phone's primary navigation, and now dressed as one: a floating frosted bar
          held off the bottom edge, the same material as the action bar above it, rather
          than an opaque strip welded to the screen.

          Three buttons, each an icon over a caption of the same weight. The captions used
          to disagree with each other — a sword glyph labelled "Hero" for what is actually
          the menu rail, a scroll labelled "Log" for what people use as chat, and a
          backpack with a gold figure where the other two had words. Now each button says
          what it opens and shows the icon that panel already uses on desktop: ☰ Menu for
          the character rail (the same hamburger its collapsed chip carries), a speech
          bubble for chat, and a sword for Gear — because Gear is the equipment you fight
          with, and the bag glyph belonged to the old "Inventory" framing. */}
      <div className="app-dock rp-glass">
        <button
          className={`app-dock-btn${panels.hero ? ' is-active' : ''}`}
          aria-label="Menu and character"
          aria-expanded={panels.hero}
          onClick={() => toggle('hero')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon ui="menu" size={20} /></span>
          <span className="app-dock-btn-label">Menu</span>
          {/* Unspent talent points ride the Menu button as a badge rather than the
              character panel itself: the panel collapses behind the accordion, and a
              point that only shows up when the panel is open is one the player will
              forget about. Gold + glow matches the in-panel "TALENTS" highlight, so
              the dock and the rail agree on "you have something to spend". */}
          {talentPoints > 0 && (
            <span
              data-talent-points={talentPoints}
              title={`${talentPoints} talent point${talentPoints === 1 ? '' : 's'} to spend`}
              style={{
                position: 'absolute',
                top: 4,
                right: 6,
                zIndex: 10,
                fontFamily: 'var(--font-ui)',
                fontSize: 14,
                fontWeight: 700,
                color: '#ffd86b',
                lineHeight: 1,
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(255,216,107,0.8)',
                textShadow: '0 0 6px rgba(255,216,107,0.9)',
                boxShadow: '0 0 8px rgba(255,216,107,0.7), 0 0 16px rgba(255,216,107,0.3)',
                pointerEvents: 'none',
              }}
            >
              +{talentPoints}
            </span>
          )}
        </button>
        <button
          className={`app-dock-btn${panels.log ? ' is-active' : ''}`}
          aria-label="Chat and combat log"
          aria-expanded={panels.log}
          onClick={() => toggle('log')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon ui="chat" size={20} /></span>
          <span className="app-dock-btn-label">Chat</span>
        </button>
        <button
          className={`app-dock-btn${panels.bag ? ' is-active' : ''}`}
          aria-label={`Gear — ${formatGold(gold)} gold`}
          aria-expanded={panels.bag}
          onClick={() => toggle('bag')}
        >
          <span className="app-dock-btn-icon"><SpriteIcon emoji="⚔" size={20} /></span>
          <span className="app-dock-btn-label">Gear</span>
          {/* Gold rides the Gear button rather than occupying a bar across the top of the
              world: it belongs with the things you spend it on, and costs no vertical
              space. As a badge rather than a substituted caption, so all three buttons
              still read as the same control. */}
          <span className="app-dock-gold">{formatGold(gold)}</span>
        </button>
      </div>

      {/* ── Centre-screen announcements ──
          Craft reveals and level-ups used to be tucked into the top-right stack under the
          minimap, where on desktop the inventory rail (z 50) draws straight over the HUD
          layer (z 20) — the card the player earned was literally behind a panel. These are
          the two moments the game most needs to land, so they land in the middle of the
          screen, over everything, and expire on their own. */}
      <div className="toast-centre">
        <LevelUpToast />
      </div>
      {/* The craft card sits at the TOP, not with the level-up in the middle.
          They are different kinds of moment and were never really the same problem. A
          level-up is a beat: it wants the centre of the screen, it wants to interrupt, and
          it is over in five seconds. A finished craft is a RECEIPT — it hangs around for
          six and a half, it arrives while the player is watching a fight, and dead centre
          means the one thing they were looking at is behind it for the duration. Top-centre
          keeps it unmissable without standing on the hero. */}
      <div className="toast-top">
        <CraftResultToast />
      </div>

      {/* No scrim. The hero and inventory drawers used to dim the world behind them, which
          made them read as modals that own the screen — but they are not: they are panels
          you glance at while an idle game keeps running, exactly like the chat sheet, which
          never had one for that reason. Greying out the world is greying out the thing you
          opened the app to watch.

          Nothing is lost with it gone. Tap-outside dismissal never came from the scrim —
          it comes from the shared dismissable stack, which is the only thing that knows
          whether the drawer is still the frontmost surface — and a tap on open ground
          issuing a move order behind the closing panel is the MMO convention the target
          card and the chat sheet already follow. */}
    </div>
  )
}
