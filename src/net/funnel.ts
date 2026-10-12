// ── Funnel: one row the first time a character passes each milestone ───────────
//
// Written 2026-10-11 to answer one question: where does a new player stop? The save table
// already showed that real players leave somewhere between level 1 and 8, inside half an
// hour, and almost never come back on day two — but not at which step.
//
// Every milestone is a one-way door, derived from state rather than hooked into the code
// that causes it: "has at least one kill", "is level 5", "has turned in a quest". That
// keeps this file the only one that knows the funnel exists (the store calls two functions
// and nothing else), and it means a milestone can't be missed because some new code path
// levels the hero without going through the hook.
//
// Sending is idempotent twice over. `funnel_events` is keyed on (user, slot, event) and the
// insert ignores duplicates, and the client remembers what it has already sent so an
// autosave doesn't make a request when nothing new happened. Like everything that goes
// through `cloudFetch`, nothing here can throw into the game or wait on the network.
//
// Table and store-label notes: supabase/migrations/20261011000000_funnel_events.sql.

import { Capacitor } from '@capacitor/core'
import type { GameState } from '../data/types'
import { cloudFetch } from './cloudClient'
import { cloudEnabled, restUrl } from './cloudConfig'
import { ensureSession } from './session'

const TABLE = 'funnel_events'
const SENT_KEY = 'stillmarch_funnel_v1'
const DAY_MS = 86_400_000

const LEVELS = [2, 3, 5, 8, 10, 15, 20, 30]
const PLAY_MINUTES = [5, 15, 30, 60, 180]
const QUESTS = [1, 3]
const ZONES = [2, 3]
// Days counted from the character's creation, on the first session that falls on that day.
// `return_4h` catches the player who comes back the same evening, which a day bucket misses.
const RETURN_DAYS = [1, 2, 3, 7, 14, 30]

/** The milestones this state has passed. Cheap — it runs on every autosave. */
function progressMilestones(s: GameState): string[] {
  const out = ['created']
  const kills = Object.values(s.totalZoneKills ?? {}).reduce((a, b) => a + (b ?? 0), 0)
  if (kills > 0) out.push('first_kill')
  for (const l of LEVELS) if (s.level >= l) out.push(`level_${l}`)
  const quests = s.completedQuestIds?.length ?? 0
  for (const q of QUESTS) if (quests >= q) out.push(`quest_${q}`)
  const zones = s.unlockedZones?.length ?? 1
  for (const z of ZONES) if (zones >= z) out.push(`zone_${z}`)
  const minutes = (s.totalPlayTime ?? 0) / 60
  for (const m of PLAY_MINUTES) if (minutes >= m) out.push(`play_${m}m`)
  return out
}

function returnMilestones(createdAt: number, now: number): string[] {
  const age = now - createdAt
  const out: string[] = []
  if (age >= 4 * 3_600_000) out.push('return_4h')
  const day = Math.floor(age / DAY_MS)
  if (RETURN_DAYS.includes(day)) out.push(`return_d${day}`)
  return out
}

// ── What has already gone up ─────────────────────────────────────────────────

let sent: Record<string, string[]> | null = null
const inFlight = new Set<string>()

function sentFor(slotId: string): Set<string> {
  if (!sent) {
    try { sent = JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') ?? {} } catch { sent = {} }
  }
  return new Set(sent![slotId] ?? [])
}

function markSent(slotId: string, events: string[]): void {
  const have = sentFor(slotId)
  for (const e of events) have.add(e)
  sent![slotId] = [...have]
  try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)) } catch { /* next launch resends; the key dedupes */ }
}

async function send(slotId: string, events: string[], playTime: number): Promise<void> {
  const have = sentFor(slotId)
  const fresh = events.filter(e => !have.has(e) && !inFlight.has(`${slotId}:${e}`))
  if (fresh.length === 0 || !cloudEnabled()) return
  for (const e of fresh) inFlight.add(`${slotId}:${e}`)
  try {
    if (!(await ensureSession())) return
    const platform = Capacitor.getPlatform()
    const dev = import.meta.env.DEV
    const res = await cloudFetch(restUrl(TABLE), {
      method: 'POST',
      body: fresh.map(event => ({
        slot_id: slotId, event, platform, dev, play_time: Math.max(0, Math.round(playTime)),
      })),
      prefer: 'resolution=ignore-duplicates,return=minimal',
    })
    // Only a confirmed write is remembered. A failure is retried by the next autosave.
    if (res.ok) markSent(slotId, fresh)
  } finally {
    for (const e of fresh) inFlight.delete(`${slotId}:${e}`)
  }
}

// ── The two calls the store makes ────────────────────────────────────────────

let active: { slotId: string; createdAt: number; state: GameState } | null = null

/** On every save: record any milestone the character has newly passed. */
export function trackProgress(slotId: string, createdAt: number, state: GameState): void {
  active = { slotId, createdAt, state }
  void send(slotId, progressMilestones(state), state.totalPlayTime ?? 0)
}

/**
 * At the start of a session — a slot loaded, or the app brought back to the foreground.
 * `offlineGranted` marks the "come back richer" moment the idle loop is built around.
 */
export function trackSession(slotId: string, createdAt: number, state: GameState,
                             offlineGranted = false): void {
  active = { slotId, createdAt, state }
  const events = returnMilestones(createdAt, Date.now())
  if (offlineGranted) events.push('offline_reward')
  void send(slotId, events, state.totalPlayTime ?? 0)
}

/** A resume doesn't reload the slot, so it is picked up here. */
export function installFunnel(): () => void {
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || !active) return
    trackSession(active.slotId, active.createdAt, active.state)
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}

/** Forget the active slot when the player leaves it for the menu. */
export function clearFunnelSlot(): void {
  active = null
}
