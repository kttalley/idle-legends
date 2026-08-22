// Party chat — the private channel for everyone in the player's group.
//
// ── Why this is its own module rather than a chat-panel tab over the existing log ──
// The chat log already supports a `'party'` channel via `pushChat` / `resolveChat` and
// is observable to any component via `subscribeChat`. This module owns the THREE things
// the log does NOT know: a per-party conversation transcript (so replies can be aware
// of what the previous member said), per-member busy guards (so a fan-out does not
// stack duplicate placeholders on the same hero), and the ambient-banter hook that
// turns a `kill` / `lowHp` event into a rare party-channel quip from one member.
//
// Same isolation rule as everything else in this stack — nothing here reaches the store.
// The transcript is keyed by a stable `partyId` derived from the current roster, so it
// survives a roster reorder and resets on membership change or zone change (the
// latter routed through `disbandParty → clearPartyChat`).
//
// ── Conversation flow ──────────────────────────────────────────────────────────
//
// One member replies at a time. The flow on a player message:
//   1. Echo the player line to the chat panel + transcript.
//   2. Pick ONE member to reply (the one who spoke least recently, shuffled off the
//      counter so the same hero does not always go first).
//   3. Schedule a follow-up reply from a DIFFERENT member ~2s after the first resolves,
//      so the chat reads as a conversation rather than a Q&A. The follow-up prompt
//      contains the previous reply and is told it may address that member by name.
//
// Player replies mid-flow: any new send cancels the pending follow-up. The new turn
// starts fresh with the same picker.
//
// ── Bubble channel ─────────────────────────────────────────────────────────────
//
// Party members' speech also surfaces as bubbles over their head in the canvas, in the
// same colour their nameplate uses. The bubble pipeline is owned by `combatAdapter`
// (it reads `a.bark` / `a.barkT` per `Ambient` and draws via `drawAmbientBarks`),
// so this module does not reach into renderer state. Instead it publishes a small
// observable: `subscribePartyBubbles` fires with the key of a hero that just spoke,
// plus the line and how long the bubble should live, and the adapter matches the key
// to its ambient list and updates the bubble fields. One direction (engine → renderer),
// one observable, no shared mutable state.
//
// ── Rival-faction trash talk ───────────────────────────────────────────────────
//
// Party members do NOT use the party channel to trash talk the other faction. When
// they cross a hostile, they say it in /zone — that's where the player and the world
// hear it. The party channel stays for friendly group chat. `tryPartyTrashTalk` is
// the hook the adapter calls on `rivalFaction` events, gated by the same chance +
// cooldown as the rest of the banter so it never floods.

import { resolveFaction } from '../data/factions'
import type { ChatContext, ChatSpeaker } from './chatGen'
import { sanitize } from './chatGen'
import { pushChat, resolveChat } from './chatLog'
import { isLlmReachable, llmGenerate, PRIORITY } from './llmClient'
import { getCompanionStatuses, getParty } from './party'
import { entityKey } from './whisper'

// ── Public API ─────────────────────────────────────────────────────────────────

export interface PartyChatContext {
  playerName: string
  playerFaction: string
  zoneName: string
  zoneTheme: string
}

interface Turn {
  who: 'player' | 'hero'
  /** The hero's entityKey, so a transcript can identify who said what when rebuilding
   *  the per-speaker prompt. Undefined for the player's own turns. */
  speaker?: string
  text: string
}

// ── Shared transcript ──────────────────────────────────────────────────────────
// Keyed by a stable `partyId`. A new id = a fresh conversation; an old entry is
// simply never read again and is GC'd when the next id differs.
const MAX_TURNS = 16
const transcripts = new Map<string, Turn[]>()

// Per-member busy guard. Each member can hold their own in-flight reply even while
// another member is mid-LLM — that is what makes the conversation serialised in
// TIMING without ever having two members cross-talk in the same prompt.
const busy = new Set<string>()

// ── Conversation flow state ────────────────────────────────────────────────────
//
// `pendingFollowup` is the timer for the next reply in a chain. Cleared whenever the
// player sends a new line, so a fast-typing player never queues a phantom second
// reply on top of their new turn.
let pendingFollowup: ReturnType<typeof setTimeout> | null = null

// Tracks who spoke last, so the picker can avoid the same hero twice in a row.
//
// (Implemented inline in `pickNextSpeaker` via the per-call `previousKey` argument
// rather than a module-level slot — the slot made the broken "stuck on the same
// hero" bug possible when two reply chains interleaved. Per-call keeps the picker
// stateless, which is what serialised timing already requires.)

// ── Ambient banter state ───────────────────────────────────────────────────────
// Decremented in the calling adapter tick; reset after a fire. The lock prevents
// re-entry while a banter upgrade LLM call is in flight (a single ambient event
// must not double-fire, even across two adapter ticks that happen back-to-back).
const PARTY_BANTER_COOLDOWN_SECONDS = 60
const PARTY_BANTER_CHANCE = 0.15
const PARTY_TRASH_TALK_COOLDOWN_SECONDS = 25
const PARTY_TRASH_TALK_CHANCE = 0.35
let partyBanterCd = 0
let partyBanterLock = false
let partyTrashTalkCd = 0

// ── Bubble subscription ────────────────────────────────────────────────────────
//
// Fires whenever a party member says something in the party channel — by the player
// or by ambient banter. The renderer matches the key to its `Ambient` and updates
// `a.bark` / `a.barkT`. Lives in its own observable rather than threading through
// the game store for the same reason as everything else in this stack: ambient
// state must not travel through player state.

export interface PartyBubbleEvent {
  /** The hero's entityKey — what the renderer matches against `Ambient.identity`. */
  key: string
  text: string
  /** Seconds the bubble should stay up. */
  duration: number
}

const bubbleListeners = new Set<(e: PartyBubbleEvent) => void>()

export function subscribePartyBubbles(fn: (e: PartyBubbleEvent) => void): () => void {
  bubbleListeners.add(fn)
  return () => { bubbleListeners.delete(fn) }
}

function emitBubble(e: PartyBubbleEvent): void {
  for (const l of bubbleListeners) l(e)
}

// ── Player → one member (chained) ─────────────────────────────────────────────

/**
 * Send a line to the party channel and start a chained reply.
 *
 * The chained reply ALWAYS steps through `pickNextSpeaker` so the same hero does not
 * speak twice in a row when the party has more than one member. The first reply
 * comes from whatever member the picker returns; the follow-up comes from a
 * different one, ~2s after the first resolves, and the player may address that
 * previous reply by name (the prompt includes it).
 *
 * A new send cancels any pending follow-up, so quickly typing two messages never
 * stacks a phantom reply to the first message on top of the second.
 */
export function sendPartyChat(text: string, ctx: PartyChatContext): void {
  const msg = text.trim()
  if (!msg) return

  const members = currentMembers()
  if (!members.length) return

  const pid = partyId(members)
  if (!pid) return

  // A new turn from the player supersedes a chained follow-up. The follow-up would
  // be replying to the message the player JUST replaced, and the player is no longer
  // waiting on it.
  cancelPendingFollowup()

  // Player's own line, instant.
  pushChat({
    channel: 'party',
    from: ctx.playerName || 'You',
    faction: resolveFaction(ctx.playerFaction),
    mine: true,
    text: msg,
  })

  const transcript = transcripts.get(pid) ?? []
  transcript.push({ who: 'player', text: msg })

  const first = pickNextSpeaker(members, undefined)
  if (!first) return

  fireReply(first, members, ctx, pid, transcript, msg, true)
}

/**
 * Schedule a follow-up reply from a different member. Called by `fireReply` once
 * the first reply has resolved. The follow-up prompt is told that the previous
 * reply was [name], so the second member can react to it.
 */
function scheduleFollowup(
  members: ReturnType<typeof currentMembers>,
  ctx: PartyChatContext,
  pid: string,
  transcript: Turn[],
  prevSpeakerKey: string,
): void {
  cancelPendingFollowup()
  const next = pickNextSpeaker(members, prevSpeakerKey)
  if (!next) return
  pendingFollowup = setTimeout(() => {
    pendingFollowup = null
    // The transcript may have grown stale if the party disbanded in the meantime.
    if (!currentMembers().length) return
    const fresh = transcripts.get(pid) ?? transcript
    const lastPlayer = [...fresh].reverse().find(t => t.who === 'player')
    const prevReply = [...fresh].reverse().find(t => t.who === 'hero' && t.speaker === prevSpeakerKey)
    if (!lastPlayer) return
    // Pass the previous reply as the implicit topic so the chain has a real anchor.
    const anchor = prevReply ? `${prevReply.text}` : lastPlayer.text
    fireReply(next, members, ctx, pid, fresh, anchor, false, prevSpeakerKey)
  }, 2200)
}

function cancelPendingFollowup(): void {
  if (pendingFollowup !== null) {
    clearTimeout(pendingFollowup)
    pendingFollowup = null
  }
}

/**
 * Pick the next member to speak. Pass the previous speaker's key to exclude them.
 *
 * Round-robin: round the index forward by 1 (or 2 if the previous speaker is the
 * only candidate we want to skip) and pick that member. Falls back to "first
 * available" if the party shrank under the picker.
 */
function pickNextSpeaker(
  members: ReturnType<typeof currentMembers>,
  previousKey: string | undefined,
): { key: string; speaker: ChatSpeaker } | null {
  if (!members.length) return null
  if (members.length === 1) return members[0]
  // Find the previous speaker's index and start the scan one position after it.
  const start = previousKey
    ? (members.findIndex(m => m.key === previousKey) + 1) % members.length
    : 0
  // Walk the cycle looking for a non-busy member. Anyone not in `busy` is fair game.
  for (let i = 0; i < members.length; i++) {
    const idx = (start + i) % members.length
    const m = members[idx]
    if (m.key === previousKey) continue
    if (busy.has(m.key)) continue
    return m
  }
  // Everyone is busy OR the only non-busy member is the previous one. Skip-busy
  // should never happen in practice (a refresh would have placed a member) but
  // bail cleanly rather than holding the player up.
  return null
}

/**
 * Run one reply: push a pending placeholder, dispatch the LLM call (or offline
 * fallback), and on success schedule a follow-up from a different member.
 */
function fireReply(
  member: { key: string; speaker: ChatSpeaker },
  members: ReturnType<typeof currentMembers>,
  ctx: PartyChatContext,
  pid: string,
  transcript: Turn[],
  msg: string,
  fromPlayer: boolean,
  previousSpeakerKey?: string,
): void {
  const key = member.key
  if (busy.has(key)) return
  busy.add(key)

  // Pending placeholder. The previous behaviour published a canned line immediately
  // and then published the generated line ~4s later via resolveChat — which read
  // as "too canned". The chat now shows ONE line per speaker, and it's the live
  // one whenever the LLM is reachable.
  const placeholder = pushChat({
    channel: 'party',
    from: member.speaker.name,
    faction: resolveFaction(member.speaker.faction),
    entityKey: key,
    text: '…',
    pending: true,
  })

  if (!isLlmReachable()) {
    // Offline / no endpoint: still answer, so typing in party chat is never a dead end.
    const reply = OFFLINE_PARTY_QUIPS[(msg.length + key.length) % OFFLINE_PARTY_QUIPS.length]
    const t = transcripts.get(pid) ?? transcript
    t.push({ who: 'hero', speaker: key, text: reply })
    transcripts.set(pid, t.slice(-MAX_TURNS))
    busy.delete(key)
    setTimeout(() => {
      resolveChat(placeholder.id, reply)
      emitBubble({ key, text: reply, duration: 3.2 })
      if (fromPlayer && members.length > 1) {
        scheduleFollowup(members, ctx, pid, t, key)
      } else {
        // A follow-up that just resolved — no further chaining. Conversation dies
        // back to silence until the player or an ambient event prompts again.
      }
    }, 600)
    return
  }

  const prompt = buildPrompt(
    member.speaker, members, ctx, transcript, msg,
    fromPlayer ? 'player' : 'chain',
    previousSpeakerKey,
  )

  void llmGenerate({
    prompt,
    priority: PRIORITY.INTERACTIVE,
    numPredict: 40,
    stop: ['\n'],
    temperature: 0.95,
    timeoutMs: 20_000,
  })
    .then(raw => {
      const lines = sanitize(raw)
      const reply = lines[0] ?? ''
      if (!reply) throw new Error('empty reply')
      const t = transcripts.get(pid) ?? transcript
      t.push({ who: 'hero', speaker: key, text: reply })
      transcripts.set(pid, t.slice(-MAX_TURNS))
      resolveChat(placeholder.id, reply)
      emitBubble({ key, text: reply, duration: 3.2 })
      if (fromPlayer && members.length > 1) {
        scheduleFollowup(members, ctx, pid, t, key)
      }
    })
    .catch(() => {
      // Stay in character. A hero who doesn't answer is an ordinary thing in an MMO.
      resolveChat(placeholder.id, '…', true)
    })
    .finally(() => { busy.delete(key) })
}

// ── Ambient banter ─────────────────────────────────────────────────────────────
//
// Called from `combatAdapter.tryBark` after the zone-channel bark has posted. Rare,
// single-speaker, gated by a cooldown. Posts a party-channel line about what just
// happened — a kill, a low-HP scare, a juicy loot roll — and asks the LLM for an
// upgrade if reachable. Designed NOT to compete with the player's fan-out: one
// speaker, INTERACTIVE priority, short num_predict.

const BANTER_QUIPS: Record<string, string[]> = {
  engage: ['pulling', 'inc', 'watch adds', 'on it'],
  kill: ['nice', 'good pull', 'gg', 'their loot sucks'],
  lowHp: ['watch ur hp', 'pot up', 'heals?', 'omg'],
  died: ['rip', 'corpse run', 'lag?'],
  loot: ['vendor trash', 'need?', 'nice drop', 'greed'],
  // Rival-faction banter: party members still use the party channel for THIS one
  // because it's the squad reacting to the player getting ganked, not a public
  // taunt. The player-to-rival trash talk goes through `tryPartyTrashTalk` below.
  rivalFaction: ['lol get rekt', 'sit down', 'delete this nerd', 'lmao'],
}

/** Map a BarkEvent to the banter pool key. Falls back to 'engage'. */
function banterKeyFor(event: string): string {
  if (event in BANTER_QUIPS) return event
  return 'engage'
}

export function tryPartyBanter(event: string, ctx: ChatContext): void {
  if (partyBanterCd > 0 || partyBanterLock) return
  const members = currentMembers()
  if (!members.length) return

  // Roll the chance gate. A deterministic, ambient-side RNG would be ideal here, but
  // the global `Math.random` is what the ambient bark pipeline already uses for its
  // own chance rolls — see `tryBark` in `combatAdapter`. Stay consistent.
  if (Math.random() >= PARTY_BANTER_CHANCE) return

  const speaker = pickSpeaker(event, members)
  const key = entityKey(speaker.speaker)
  const pool = BANTER_QUIPS[banterKeyFor(event)] ?? BANTER_QUIPS.engage
  const line = pool[Math.floor(Math.random() * pool.length)]

  const placeholder = pushChat({
    channel: 'party',
    from: speaker.speaker.name,
    faction: resolveFaction(speaker.speaker.faction),
    entityKey: key,
    text: line,
  })

  // Update the bubble immediately, so the canned line shows up even before the
  // LLM upgrade arrives — same shape as `tryBark` in the adapter.
  partyBanterCd = PARTY_BANTER_COOLDOWN_SECONDS
  emitBubble({ key, text: line, duration: 2.8 })

  if (!isLlmReachable()) return

  partyBanterLock = true

  const transcript = transcripts.get(partyId(members)) ?? []

  void llmGenerate({
    prompt: buildBanterPrompt(speaker.speaker, members, ctx, event, line),
    priority: PRIORITY.INTERACTIVE,
    numPredict: 28,
    stop: ['\n'],
    temperature: 0.95,
    timeoutMs: 20_000,
    staleAfterMs: 15_000,
  })
    .then(raw => {
      const lines = sanitize(raw)
      const reply = lines[0]
      if (reply) {
        resolveChat(placeholder.id, reply)
        emitBubble({ key, text: reply, duration: 2.8 })
        transcript.push({ who: 'hero', speaker: key, text: reply })
        const pid = partyId(currentMembers())
        if (pid) transcripts.set(pid, transcript.slice(-MAX_TURNS))
      }
    })
    .catch(() => { /* canned line already showed; nothing to recover */ })
    .finally(() => { partyBanterLock = false })
}

/**
 * Party-channel trash talk directed at a hostile the player just walked past.
 *
 * Distinct from `tryPartyBanter` in two ways:
 *   1. Higher chance and shorter cooldown — trash talk is a much more frequent
 *      reaction than kill banter, and it should feel reflexive.
 *   2. The output goes to the ZONE channel, not the party channel. The party
 *      channel is for friendly group chat; rivalry is public. The player and the
 *      world read it in /zone where rival-faction barks already live.
 *
 * No LLM: the canned lines are short and the channel is noisy. A live upgrade
 * would double-publish the same line in two channels, which is the bug we are
 * trying to avoid.
 */
export function tryPartyTrashTalk(ambientName: string, ambientFaction: string): void {
  if (partyTrashTalkCd > 0) return
  const members = currentMembers()
  if (!members.length) return
  if (Math.random() >= PARTY_TRASH_TALK_CHANCE) return

  // Round-robin so the same member doesn't always get the trash talk.
  const m = pickNextSpeaker(members, undefined)
  if (!m) return
  const key = m.key
  const line = RIVAL_TRASH_TALK[
    (m.speaker.name.length + ambientName.length) % RIVAL_TRASH_TALK.length
  ]
  const filled = line
    .replace(/{target}/g, ambientName)
    .replace(/{selfFaction}/g, m.speaker.faction)
    .replace(/{targetFaction}/g, ambientFaction)

  pushChat({
    channel: 'zone',
    from: m.speaker.name,
    faction: resolveFaction(m.speaker.faction),
    entityKey: key,
    text: filled,
  })
  emitBubble({ key, text: filled, duration: 2.8 })

  partyTrashTalkCd = PARTY_TRASH_TALK_COOLDOWN_SECONDS
}

/** Decrement the banter cooldown by `dt` seconds. Called once per adapter tick. */
export function tickPartyBanter(dt: number): void {
  if (partyBanterCd > 0) partyBanterCd = Math.max(0, partyBanterCd - dt)
  if (partyTrashTalkCd > 0) partyTrashTalkCd = Math.max(0, partyTrashTalkCd - dt)
}

// ── Teardown ───────────────────────────────────────────────────────────────────

/** Drop every transcript and clear busy — called from `disbandParty` on zone change. */
export function clearPartyChat(): void {
  cancelPendingFollowup()
  transcripts.clear()
  busy.clear()
  partyBanterCd = 0
  partyBanterLock = false
  partyTrashTalkCd = 0
}

// ── Internal helpers ───────────────────────────────────────────────────────────

const OFFLINE_PARTY_QUIPS = [
  'on it', 'got ur back', 'lol', 'loving the drop rate',
  'pull more', 'any loot?', 'gg', 'next pack?', 'behind u',
]

const RIVAL_TRASH_TALK = [
  'hey {target}, looking for a corpse run?',
  '{target}, your {targetFaction} is not welcome here',
  'lol {target}, /spit',
  'sit down {target}',
  'nerf {targetFaction} pls',
  'lol watch this trash at {target}',
  'behind you {target}, watch ur back',
  '{target} is mad they pulled aggro',
]

/**
 * The current party roster, imported lazily to avoid a circular module reference
 * (`engine/party` does not depend on `engine/partyChat`, but a static import here
 * would force that). The dynamic import is invisible at runtime — Vite inlines it.
 */
function currentMembers(): Array<{ key: string; speaker: ChatSpeaker; joinedAt: number }> {
  return getParty()
}

/** Stable id for a roster: sorted member keys, joined. Order-independent. */
function partyId(members: Array<{ key: string }>): string {
  return members.map(m => m.key).sort().join('|')
}

/**
 * Pick which member speaks for ambient banter.
 *
 * Prefers a member whose current activity matches the event: `fighting` for combat
 * events, `idle` for nothing-in-particular events, otherwise the first member.
 * `CompanionStatus.activity` is published by the adapter at `tryBark`'s tick rate.
 */
function pickSpeaker(
  event: string,
  members: Array<{ key: string; speaker: ChatSpeaker; joinedAt: number }>,
): { speaker: ChatSpeaker } {
  const statuses = getCompanionStatuses()
  const wantActivity = event === 'kill' || event === 'engage' || event === 'lowHp' || event === 'died'
    ? 'fighting'
    : event === 'loot' ? 'looting'
    : 'idle'
  const match = members.find(m => statuses[m.key]?.activity === wantActivity)
  return match ?? { speaker: members[0].speaker }
}

function specStr(s: ChatSpeaker): string {
  return s.spec ? `${s.spec} ${s.playerClass}` : s.playerClass
}

function buildPrompt(
  self: ChatSpeaker,
  members: Array<{ speaker: ChatSpeaker }>,
  ctx: PartyChatContext,
  transcript: Turn[],
  msg: string,
  origin: 'player' | 'chain',
  previousSpeakerKey: string | undefined,
): string {
  const others = members
    .map(m => m.speaker)
    .filter(s => entityKey(s) !== entityKey(self))
  const roster = others
    .map(o => `- ${o.name}, level ${o.level} ${o.race} ${specStr(o)} of ${o.faction}`)
    .join('\n')
  const lines = transcript
    .map(t => {
      const who = t.who === 'player' ? (ctx.playerName || 'You') : speakerName(t.speaker)
      return `${who}: ${t.text}`
    })
    .join('\n')
  const prevNote = previousSpeakerKey && origin === 'chain'
    ? `\nThe previous reply in this chain was from ${speakerName(previousSpeakerKey)}. You may react to or build on what they said.`
    : ''
  return `You are roleplaying a player character in a fantasy MMO, replying in your
group's private chat channel. Your party is fighting through a zone together.
Reply in ONE short chat message.${prevNote}

You are ${self.name}, a level ${self.level} ${self.race} ${specStr(self)} of ${self.faction}.
You are currently out in ${ctx.zoneName}, grinding mobs.

Your party members are:
${roster}

Party chat so far:
${lines}

${ctx.playerName} says: ${msg}

Reply as ${self.name}, in ONE short chat message. Max 18 words. Casual MMO register,
lowercase, abbreviations fine. You may address or react to other party members by
name. No name prefix on YOUR own line, no quotes, no narration, no asterisks. Only
the message.`
}

function buildBanterPrompt(
  self: ChatSpeaker,
  members: Array<{ speaker: ChatSpeaker }>,
  ctx: ChatContext,
  event: string,
  cannedLine: string,
): string {
  const others = members
    .map(m => m.speaker)
    .filter(s => entityKey(s) !== entityKey(self))
  const roster = others.length
    ? others.map(o => `- ${o.name}, level ${o.level} ${o.race} ${specStr(o)} of ${o.faction}`).join('\n')
    : '- (no other party members)'
  return `You are one player in a fantasy MMO, commenting in your group's private chat.

You are ${self.name}, a level ${self.level} ${self.race} ${specStr(self)} of ${self.faction}.
Zone: ${ctx.zoneName} — ${ctx.zoneTheme}
Your party members are:
${roster}

You just ${EVENT_SITUATION[event] ?? 'reacted to something happening in combat'}.
A canned line of yours was: "${cannedLine}"

Type ONE short chat message about it. Max 12 words, lowercase, casual MMO register.
You may address other party members by name. No quotes, no name prefix, no explanation.`
}

// Mirror the EVENT_SITUATION shape from chatGen so this module is self-contained for
// the prompt — keeps the banter module free of a static import of an internal map.
const EVENT_SITUATION: Record<string, string> = {
  engage: 'committed to a fight',
  kill: 'just killed a monster',
  loot: 'is looting the corpse',
  lowHp: 'almost died',
  died: 'just got killed',
  passing: 'walked past another player',
  rivalFaction: 'walked past an enemy player',
  idle: 'is standing around',
}

function speakerName(key: string | undefined): string {
  if (!key) return '?'
  // The transcript carries keys, but to render the transcript in a prompt we need
  // names. The roster is the source of truth for the CURRENT party — for older
  // members that have left, we fall back to the entityKey tail. Cheap and rare.
  const m = getParty().find(p => p.key === key)
  return m?.speaker.name ?? key.split(':')[0]
}
