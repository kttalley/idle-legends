// Generative MMO chat — LLM-authored zone chatter, with the canned pool as the floor.
//
// ── Measured latency, and what it actually implies ────────────────────────────
// Against llm.kristiantalley.com with `incept5/llama3.1-claude` (8B):
//
//   12-line batch (num_predict 300) ..... 23–42 s   (~2–3 s per line, amortised)
//   ONE line (num_predict 24, stop \n) ... 3.5–4.4 s
//
// The batch number is a function of TOKEN COUNT, not of the endpoint being slow — which
// is worth stating plainly, because reading only the batch figure leads straight to the
// wrong conclusion that live per-event generation is impossible. It is not: four seconds
// is a perfectly ordinary wait for a line of chat.
//
// Hence three paths, each matched to what it is for:
//
//  - **Pools (batch).** Background zone chatter for the chat panel. Cheapest per line,
//    and the panel needs volume more than it needs specificity.
//  - **Live barks (per-event).** A hero speaks about the thing that just happened, by
//    name — "vesk just pwned that wolf". A pool can never do this, because the line has
//    to know what the event was. Canned line shows instantly; the generated line follows
//    if it lands while still relevant.
//  - **Whispers.** Always live, with conversation history. See `whisper.ts`.
//
// Nothing is ever awaited on the render path. Every path degrades to a canned line, and
// with `VITE_LLM_URL` unset no network call is made at all. The LLM upgrades the texture
// of the chat; it is never a dependency of it.
//
// ── Endpoint exposure ─────────────────────────────────────────────────────────
// This follows the same rule `nameGen.ts` already sets: the endpoint comes from
// `VITE_LLM_URL` at build time and there is NO localhost default, so a public build with
// the var unset simply never makes a network call and plays entirely on canned lines.
// Pointing a shipped build at a personal Ollama box would expose an unauthenticated,
// unmetered endpoint to every player, so that is deliberately not the default.

import type { Rng } from './rng'
import type { BarkEvent } from './ambient'
import { isLlmReachable, llmBackedOff, llmBusy, llmGenerate, llmHealth, PRIORITY } from './llmClient'

export function isChatLlmConfigured(): boolean {
  return isLlmReachable()
}

/**
 * Chat topics. Each has its own pool, because a line has to fit the MOMENT it is spoken —
 * a loot brag fired while a hero is dying reads as a bug, not as personality.
 */
export type ChatTopic = 'chatter' | 'combat' | 'loot' | 'faction'

/** Which pool a bark event draws from. */
export const TOPIC_OF_EVENT: Record<BarkEvent, ChatTopic> = {
  engage: 'combat', kill: 'combat', lowHp: 'combat', died: 'combat',
  loot: 'loot',
  passing: 'chatter', idle: 'chatter',
  rivalFaction: 'faction',
}

const TOPIC_PROMPT: Record<ChatTopic, string> = {
  chatter:
    'idle zone chatter: looking for group, selling things, asking questions, complaining ' +
    'about drop rates, greeting people, small talk between strangers grinding the same mobs',
  combat:
    'mid-combat callouts: pulling, taunting, asking for heals, panicking at low health, ' +
    'bragging about a kill, dying badly',
  loot:
    'loot talk: rolling need or greed, bragging about a rare drop, complaining about vendor ' +
    'trash, accusing someone of ninja-looting',
  faction:
    'trash talk aimed at the enemy faction across the zone — territorial, petty, competitive, ' +
    'never genuinely hateful',
}

/** How many lines to ask for per request, and the ceiling per pool. */
const BATCH_SIZE = 8
const POOL_MAX = 40
/** Refill a pool once it drops to this. */
const POOL_LOW_WATER = 5

const pools: Record<ChatTopic, string[]> = { chatter: [], combat: [], loot: [], faction: [] }
const TOPIC_ORDER: ChatTopic[] = ['chatter', 'combat', 'loot', 'faction']

/** Only ever ONE request in flight. Eight heroes noticing an empty pool in the same
 *  frame must not become eight concurrent generations against a 30-second endpoint. */
let inFlight = false
let lastZone = ''

export interface ChatContext {
  /** Zone display name — grounds the chatter in where the players actually are. */
  zoneName: string
  /** Flavour of the zone, e.g. its level band and inhabitants. */
  zoneTheme: string
  /** The two faction names, for trash talk that uses the game's own words. */
  factions: { alliance: string; horde: string }
}

/**
 * Strip an LLM's habits back to bare chat lines.
 *
 * Small models in particular love a preamble ("Here are 10 fake MMO chat lines:"), and
 * every model will occasionally number or quote its output. A line that arrives with its
 * scaffolding attached would appear verbatim over a hero's head, so this is not
 * cosmetic tidying — it is the difference between the feature working and it looking
 * broken.
 */
function sanitize(raw: string): string[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    // Drop list markers, numbering and surrounding quotes.
    .map(l => l.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/^["'`]|["'`]$/g, '').trim())
    .filter(l => l.length > 0)
    // Preambles and headers ("Here are ten lines:", "Combat:") end in a colon.
    .filter(l => !/:$/.test(l))
    // Anything with markdown emphasis or a stage direction is scaffolding, not chat.
    .filter(l => !/^[#>]/.test(l) && !/^\(.*\)$/.test(l))
    // Chat is short. A long line is the model explaining itself.
    .filter(l => l.length >= 2 && l.length <= 64)
    // Models sometimes prefix a speaker; the game supplies its own names.
    .map(l => l.replace(/^\[?[A-Z][a-z]{2,12}\]?\s*[:>]\s*/, '').trim())
    .filter(l => l.length >= 2)
}

function buildPrompt(topic: ChatTopic, ctx: ChatContext): string {
  return `You are writing fake public chat for a fantasy MMO zone, to make a single-player game feel like a populated server.

Zone: ${ctx.zoneName} — ${ctx.zoneTheme}
Factions in this zone: ${ctx.factions.alliance} and ${ctx.factions.horde}

Write ${BATCH_SIZE} lines of ${TOPIC_PROMPT[topic]}.

Rules:
- Casual MMO chat register: lowercase, abbreviations (lfg, wts, wtb, brb, gg, ez), typos are fine.
- Maximum 8 words per line. Shorter is better.
- No player names, no timestamps, no numbering, no quotes, no explanation.
- Output ONLY the lines, one per line.`
}

/**
 * Fetch one batch into a pool. Never throws — a failed generation is a non-event that
 * leaves the canned fallback in charge.
 */
async function fetchBatch(topic: ChatTopic, ctx: ChatContext): Promise<void> {
  if (!isChatLlmConfigured() || inFlight) return
  inFlight = true
  try {
    const raw = await llmGenerate({
      prompt: buildPrompt(topic, ctx),
      priority: PRIORITY.BACKGROUND,
      // Smaller batch than the first cut: this request occupies the shared queue for its
      // whole duration, and a 30s block used to starve live barks behind it.
      numPredict: 220,
      temperature: 1.05,
      timeoutMs: 60_000,
    })
    const lines = sanitize(raw)
    if (!lines.length) throw new Error('no usable lines after sanitising')
    const pool = pools[topic]
    for (const l of lines) {
      if (pool.length >= POOL_MAX) break
      if (!pool.includes(l)) pool.push(l)
    }
  } catch {
    // Entirely non-fatal, and deliberately quiet: background refills are expected to be
    // deferred whenever anything a player can perceive is using the endpoint.
  } finally {
    inFlight = false
  }
}

/**
 * Top the pools up. Safe to call often — it is a no-op unless a pool is actually low and
 * nothing is in flight. Call it from a slow tick, never from the render loop.
 */
export function pumpChatPools(ctx: ChatContext): void {
  if (!isChatLlmConfigured()) return
  // A zone change invalidates the chatter: lines about wolves in a starter meadow are
  // wrong the moment the hero walks into a volcano.
  if (ctx.zoneName !== lastZone) {
    lastZone = ctx.zoneName
    for (const t of TOPIC_ORDER) pools[t].length = 0
  }
  if (inFlight || llmBackedOff()) return
  // Refill the emptiest low pool first, preferring 'chatter' since it carries the panel.
  const needy = TOPIC_ORDER.filter(t => pools[t].length <= POOL_LOW_WATER)
  if (!needy.length) return
  void fetchBatch(needy[0], ctx)
}

/**
 * Take a generated line for this event, or `null` if none is available.
 *
 * Synchronous by design — callers are in a behaviour tick and must never await. A null
 * return is the normal, expected case until the first batch lands; the caller falls back
 * to the canned pool.
 */
export function takeChatLine(event: BarkEvent, rng: Rng): string | null {
  const pool = pools[TOPIC_OF_EVENT[event]]
  if (!pool.length) return null
  // Remove what we hand out, so the same line does not echo around the zone.
  const i = Math.floor(rng() * pool.length) % pool.length
  return pool.splice(i, 1)[0] ?? null
}

// NOTE — keep the draw count symmetric. A hit here consumes EXACTLY ONE `rng()`, and the
// canned fallback (`pickBark`) also consumes exactly one. That is deliberate: it means an
// LLM line arriving (or not) never shifts the hero's seeded stream, so ambient behaviour
// stays reproducible whether the endpoint is up, down, or unconfigured. If this function
// ever grows a second draw, the canned path needs one too — otherwise network weather
// silently changes where every hero walks next.

// ── Live per-event barks ──────────────────────────────────────────────────────
// A pooled line is generic by construction: it was written before anyone knew what was
// about to happen. A live request knows the hero's name, class, spec and what they just
// did, so it can produce "vesk just pwned that wolf" instead of "gg". At ~4s it lands
// while the moment is still readable.

/** Who is speaking — enough identity for the line to sound like a specific person. */
export interface ChatSpeaker {
  name: string
  playerClass: string
  race: string
  faction: string
  level: number
  spec: string | null
  /** The hero's actual talent build. Carried so a duel can be resolved straight from a
   *  tap without re-deriving the identity from its seed. */
  talentAllocs?: Record<string, number>
}

/** What just happened to them, in words the prompt can use. */
const EVENT_SITUATION: Record<BarkEvent, string> = {
  engage: 'is charging into a fight with a monster',
  kill: 'just killed the monster they were fighting',
  loot: 'is looting the corpse of the monster they killed',
  lowHp: 'is about to die — almost no health left',
  died: 'just got killed by the monster',
  passing: 'is walking past another player of their own faction',
  rivalFaction: 'is walking past a player of the ENEMY faction',
  idle: 'is standing around with nothing to do',
}

/** One live request per hero at a time; the shared queue handles global ordering. */
const liveBusy = new Set<string>()

/**
 * Ask for a line about a specific event, delivered by callback when it arrives.
 *
 * Fire-and-forget: returns immediately, never throws, and simply does not call back if
 * generation is unavailable, backed off, stale or failed. The caller shows a canned line
 * up front and treats a late arrival as an upgrade, never as the thing it was waiting for.
 */
export function requestLiveBark(
  event: BarkEvent,
  speaker: ChatSpeaker,
  ctx: ChatContext,
  onLine: (line: string) => void,
  detail?: string,
): void {
  if (!isChatLlmConfigured() || llmBackedOff()) return
  if (liveBusy.has(speaker.name)) return
  liveBusy.add(speaker.name)

  const specStr = speaker.spec ? `${speaker.spec} ${speaker.playerClass}` : speaker.playerClass
  const prompt = `You are one player in a fantasy MMO, typing in zone chat.

You are ${speaker.name}, a level ${speaker.level} ${speaker.race} ${specStr} of ${speaker.faction}.
Zone: ${ctx.zoneName} — ${ctx.zoneTheme}
Right now you ${EVENT_SITUATION[event]}${detail ? ` (${detail})` : ''}.

Type ONE short chat message about it. Max 8 words, lowercase, casual MMO register
(abbreviations, typos fine). No quotes, no name prefix, no explanation. Only the message.`

  void llmGenerate({
    prompt,
    priority: PRIORITY.REACTIVE,
    // One short line. `stop` on the newline is what keeps this at ~4s rather than letting
    // the model run on to the token budget.
    numPredict: 28,
    stop: ['\n'],
    temperature: 1.05,
    timeoutMs: 15_000,
    // A bark about a kill is worthless long after the kill. Rather than speak out of
    // turn, abandon it if it could not be dispatched while the moment was still legible.
    staleAfterMs: 12_000,
  })
    .then(raw => {
      const lines = sanitize(raw)
      if (lines.length) onLine(lines[0])
    })
    .catch(() => { /* canned line already spoke; nothing to recover */ })
    .finally(() => { liveBusy.delete(speaker.name) })
}

/** Pool sizes, for the dev/debug probe. */
export function chatPoolStats(): { topic: ChatTopic; size: number }[] {
  return TOPIC_ORDER.map(t => ({ topic: t, size: pools[t].length }))
}

/** Whether generation is currently degraded, and why — surfaced in the chat panel. */
export function chatGenStatus(): 'off' | 'warming' | 'live' | 'failing' {
  if (!isChatLlmConfigured()) return 'off'
  if (llmBackedOff()) return 'failing'
  // "Live" the moment the endpoint has produced anything, pooled or not — a zone where
  // every bark is a live one still has empty pools, and reporting that as "warming up"
  // would be wrong.
  if (llmHealth().failures === 0 && !TOPIC_ORDER.every(t => pools[t].length === 0)) return 'live'
  if (llmBusy()) return 'warming'
  return TOPIC_ORDER.every(t => pools[t].length === 0) ? 'warming' : 'live'
}
