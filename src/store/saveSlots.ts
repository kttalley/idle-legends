// ── Save-slot persistence ──────────────────────────────────────────────────────
// Multi-character storage. Today this is a thin wrapper over localStorage; the
// SlotStorage interface exists so a hosted account backend (Track P/S) can drop in
// later without touching the store or UI. Migrates the legacy single-key save
// (idle_legends_save_v2) into slot 1 on first read.

import type { GameState, ClassType, RaceType, FactionType, ZoneId } from '../data/types'

export const SAVES_KEY  = 'idle_legends_saves_v1'
const LEGACY_KEY        = 'idle_legends_save_v2'
/** Quarantine for a saves file we could not parse. Never written over. */
const CORRUPT_KEY       = 'idle_legends_saves_corrupt'
/** Slot the player was last in. Read on boot to resume without a menu round-trip. */
const LAST_SLOT_KEY     = 'idle_legends_last_slot'
export const MAX_SLOTS  = 5

// Lightweight card data for the character-select screen — never carries the full
// GameState blob, so a remote backend can list slots without shipping every save.
export interface SlotSummary {
  playerName:    string
  playerClass:   ClassType
  playerRace:    RaceType
  playerFaction: FactionType
  factionName:   string   // generated display name for the player's faction
  level:         number
  currentZone:   ZoneId
  zoneCircuit:   number
}

export interface SaveSlotMeta {
  id:           string
  createdAt:    number
  lastPlayedAt: number
  summary:      SlotSummary
}

export interface SaveSlot extends SaveSlotMeta {
  state: GameState
}

interface SavesFile { slots: SaveSlot[] }

/** Derive the select-screen summary from a full game state. */
export function summarize(state: GameState): SlotSummary {
  return {
    playerName:    state.playerName,
    playerClass:   state.playerClass,
    playerRace:    state.playerRace,
    playerFaction: state.playerFaction,
    factionName:   state.factionNames?.[state.playerFaction] ?? '',
    level:         state.level,
    currentZone:   state.currentZone,
    zoneCircuit:   state.zoneCircuit ?? 0,
  }
}

export function newSlotId(): string {
  return `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Storage interface (swappable) ───────────────────────────────────────────────
export interface SlotStorage {
  list():                            SaveSlotMeta[]
  load(id: string):                  SaveSlot | null
  /** False if the write failed (quota, private mode). Never throws. */
  save(slot: SaveSlot):              boolean
  delete(id: string):                void
}

// ── Local (browser) implementation ──────────────────────────────────────────────

/** Set when a write fails (quota, private mode). The UI can surface it; the game loop
 *  must never take an exception from a failed save — see `writeFile`. */
export let lastSaveError: string | null = null
export function clearSaveError(): void { lastSaveError = null }

function readFile(): SavesFile {
  const raw = localStorage.getItem(SAVES_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SavesFile
      if (parsed && Array.isArray(parsed.slots)) return parsed
    } catch {
      // A saves file that exists but will not parse is NOT a missing file. This used to
      // fall through and write `{slots: []}` straight over it, on a path that runs on
      // every list/load/save — i.e. every autosave — so one bad parse permanently
      // destroyed every character. Quarantine it instead and return empty WITHOUT
      // writing: the player sees an empty character select, but the bytes still exist
      // and are recoverable by hand.
      try {
        if (!localStorage.getItem(CORRUPT_KEY)) localStorage.setItem(CORRUPT_KEY, raw)
      } catch { /* quarantine is best-effort; never let it throw */ }
      console.error('[saves] saves file did not parse; quarantined under', CORRUPT_KEY)
      lastSaveError = 'Your save file could not be read. It has been preserved, not overwritten.'
      return { slots: [] }
    }
  }
  // No slots file at all — attempt one-time migration of the legacy single save.
  const migrated = migrateLegacy()
  const file: SavesFile = { slots: migrated ? [migrated] : [] }
  writeFile(file)
  return file
}

/**
 * Guarded write. Returns false rather than throwing.
 *
 * `setItem` throws QuotaExceededError when the origin quota is full, and this call sits
 * on the autosave path: gameLoop → saveGame → save → writeFile. An exception here used
 * to escape into the rAF callback and kill the frame chain permanently, so a full disk
 * presented as the whole game freezing.
 */
function writeFile(file: SavesFile): boolean {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(file))
    lastSaveError = null
    return true
  } catch (e) {
    const quota = e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    lastSaveError = quota
      ? 'Out of storage — progress could not be saved.'
      : `Save failed: ${e instanceof Error ? e.message : String(e)}`
    console.error('[saves] write failed:', e)
    return false
  }
}

/** The slot the player was last in, or null. Used to resume on boot. */
export function getLastSlotId(): string | null {
  try { return localStorage.getItem(LAST_SLOT_KEY) } catch { return null }
}

export function setLastSlotId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_SLOT_KEY, id)
    else localStorage.removeItem(LAST_SLOT_KEY)
  } catch { /* non-fatal: worst case the player lands on character select */ }
}

function migrateLegacy(): SaveSlot | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as GameState
    if (!state || !state.initialized) return null
    const now = Date.now()
    return {
      id:           newSlotId(),
      createdAt:    now,
      lastPlayedAt: now,
      summary:      summarize(state),
      state,
    }
  } catch {
    return null
  }
}

export const localSlotStorage: SlotStorage = {
  list() {
    // Return metadata only — strip the heavy state blob.
    return readFile().slots
      .map(({ id, createdAt, lastPlayedAt, summary }) => ({ id, createdAt, lastPlayedAt, summary }))
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
  },

  load(id) {
    return readFile().slots.find(s => s.id === id) ?? null
  },

  save(slot) {
    const file = readFile()
    const idx = file.slots.findIndex(s => s.id === slot.id)
    if (idx >= 0) file.slots[idx] = slot
    else file.slots.push(slot)
    return writeFile(file)
  },

  delete(id) {
    const file = readFile()
    file.slots = file.slots.filter(s => s.id !== id)
    writeFile(file)
    if (getLastSlotId() === id) setLastSlotId(null)
  },
}

// Active storage backend. Swap this to a remote implementation for hosted accounts.
export const slotStorage: SlotStorage = localSlotStorage
