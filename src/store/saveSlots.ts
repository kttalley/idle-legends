// ── Save-slot persistence ──────────────────────────────────────────────────────
// Multi-character storage. Today this is a thin wrapper over localStorage; the
// SlotStorage interface exists so a hosted account backend (Track P/S) can drop in
// later without touching the store or UI. Migrates the legacy single-key save
// (idle_legends_save_v2) into slot 1 on first read.

import type { GameState, ClassType, RaceType, FactionType, ZoneId } from '../data/types'

export const SAVES_KEY  = 'idle_legends_saves_v1'
const LEGACY_KEY        = 'idle_legends_save_v2'
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
  save(slot: SaveSlot):              void
  delete(id: string):                void
}

// ── Local (browser) implementation ──────────────────────────────────────────────
function readFile(): SavesFile {
  const raw = localStorage.getItem(SAVES_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SavesFile
      if (parsed && Array.isArray(parsed.slots)) return parsed
    } catch { /* fall through to fresh/migrated file */ }
  }
  // No slots file yet — attempt one-time migration of the legacy single save.
  const migrated = migrateLegacy()
  const file: SavesFile = { slots: migrated ? [migrated] : [] }
  writeFile(file)
  return file
}

function writeFile(file: SavesFile): void {
  localStorage.setItem(SAVES_KEY, JSON.stringify(file))
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
    writeFile(file)
  },

  delete(id) {
    const file = readFile()
    file.slots = file.slots.filter(s => s.id !== id)
    writeFile(file)
  },
}

// Active storage backend. Swap this to a remote implementation for hosted accounts.
export const slotStorage: SlotStorage = localSlotStorage
