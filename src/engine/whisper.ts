// Whispers — the player talking directly to one ambient hero.
//
// This is the one place in the living-world stack where a network round trip is not just
// tolerable but correct. A bark has to land in the moment or not at all; a whisper is a
// conversation, and ~4s before someone types back reads as a person on the other end
// rather than as lag. So whispers are always LIVE per-request, never pooled.
//
// Each hero keeps its own short conversation history, which is what makes them feel like
// a character rather than a text generator: they remember what you just said, they stay
// in their class and faction voice, and a Bulwark warrior answers differently from an
// Affliction warlock.
//
// The isolation rule still holds — nothing here reaches the store. A whisper thread is
// text about a scenery entity; it cannot touch the player's combat, loot, XP or economy.

import type { ChatSpeaker } from './chatGen'
import { pushChat, resolveChat } from './chatLog'
import { isLlmReachable, llmGenerate, PRIORITY } from './llmClient'

function configured(): boolean {
  return isLlmReachable()
}

interface Turn { who: 'player' | 'hero'; text: string }

/** Conversation memory, keyed by entity. Bounded — a whisper thread is small talk. */
const MAX_TURNS = 8
const threads = new Map<string, Turn[]>()

/** One request per hero at a time; the player can spam Enter. */
const busy = new Set<string>()

/** Stable identity for a hero across frames. Name alone collides — the ambient name pool
 *  is small enough that two Corvins routinely share a zone — so fold in the rest. */
export function entityKey(s: ChatSpeaker): string {
  return `${s.name}:${s.playerClass}:${s.race}:${s.level}`
}

export function whisperHistory(key: string): Turn[] {
  return threads.get(key) ?? []
}

export function isWhisperBusy(key: string): boolean {
  return busy.has(key)
}

/** Canned deflections, so whispering still does *something* with no endpoint configured. */
const OFFLINE_REPLIES = [
  'brb', 'sorry afk', 'busy rn, farming', 'cant talk, in combat',
  'who dis?', 'lol wrong person?', 'k', 'sup',
]

function buildPrompt(speaker: ChatSpeaker, playerName: string, zoneName: string, history: Turn[], msg: string): string {
  const specStr = speaker.spec ? `${speaker.spec} ${speaker.playerClass}` : speaker.playerClass
  const transcript = history
    .map(t => `${t.who === 'player' ? playerName : speaker.name}: ${t.text}`)
    .join('\n')
  return `You are roleplaying a player character in a fantasy MMO, replying to a private whisper.

You are ${speaker.name}, a level ${speaker.level} ${speaker.race} ${specStr} of ${speaker.faction}.
You are currently out in ${zoneName}, grinding mobs.
You are NOT an assistant. You are a random player who happens to be online. You have your
own agenda: farming, gearing up, looking for groups. You can be friendly, curt, sarcastic,
or suspicious — whatever fits your class and faction.

${transcript ? `Conversation so far:\n${transcript}\n` : ''}
${playerName} whispers: ${msg}

Reply as ${speaker.name}, in ONE short chat message. Max 20 words. Casual MMO register,
lowercase, abbreviations fine. No name prefix, no quotes, no narration, no asterisks.
Only the message.`
}

function sanitizeReply(raw: string): string {
  const first = raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !/^[*(]/.test(l))       // drop stage directions / emotes
    .filter(l => !/:$/.test(l))           // drop headers
    [0] ?? ''
  return first
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^\[?[A-Z][a-z]{2,12}\]?\s*[:>]\s*/, '')   // strip a name prefix
    .slice(0, 160)
    .trim()
}

/**
 * Send a whisper and post the reply into the chat log when it arrives.
 *
 * Posts the player's own line immediately plus a pending placeholder, so the UI shows a
 * real conversation with a typing indicator rather than freezing. Never throws.
 */
export function sendWhisper(
  speaker: ChatSpeaker,
  playerName: string,
  zoneName: string,
  zoneTheme: string,
  text: string,
): void {
  const msg = text.trim()
  if (!msg) return
  const key = entityKey(speaker)
  if (busy.has(key)) return

  pushChat({ channel: 'whisper', from: playerName, to: speaker.name, mine: true, entityKey: key, text: msg })

  const history = threads.get(key) ?? []
  history.push({ who: 'player', text: msg })

  const placeholder = pushChat({
    channel: 'whisper', from: speaker.name,
    faction: speaker.faction === 'horde' ? 'horde' : 'alliance',
    entityKey: key, text: '…', pending: true,
  })

  if (!configured()) {
    // No endpoint: still answer, so whispering is never a dead end in an offline build.
    const reply = OFFLINE_REPLIES[(msg.length + key.length) % OFFLINE_REPLIES.length]
    history.push({ who: 'hero', text: reply })
    threads.set(key, history.slice(-MAX_TURNS))
    setTimeout(() => resolveChat(placeholder.id, reply), 600)
    return
  }

  busy.add(key)

  void llmGenerate({
    prompt: buildPrompt(speaker, playerName, zoneName, history.slice(0, -1), msg),
    // The player is sitting there watching a typing indicator, so this outranks
    // everything else queued for the endpoint — including barks and pool refills.
    priority: PRIORITY.INTERACTIVE,
    numPredict: 60,
    stop: ['\n'],
    temperature: 0.95,
    timeoutMs: 25_000,
  })
    .then(raw => {
      const reply = sanitizeReply(raw)
      if (!reply) throw new Error('empty reply')
      history.push({ who: 'hero', text: reply })
      threads.set(key, history.slice(-MAX_TURNS))
      resolveChat(placeholder.id, reply)
    })
    .catch(err => {
      console.warn('[whisper] failed:', err)
      // Stay in character rather than surfacing an error: a player who does not answer
      // is an ordinary thing in an MMO, and it keeps the illusion intact.
      resolveChat(placeholder.id, '…', true)
    })
    .finally(() => { busy.delete(key) })
}

/** Drop every thread — called on zone change, since the crowd is regenerated. */
export function clearWhisperThreads(): void {
  threads.clear()
  busy.clear()
}

// ── Who the player is currently whispering ────────────────────────────────────
// Kept here as its own observable rather than threaded down through CombatView →
// DimetricWorldScene as props. The tap originates in the canvas adapter and is consumed
// by a panel on the other side of the layout; prop-drilling it would put an ambient-world
// concern into three components that otherwise have nothing to do with chat.

let target: ChatSpeaker | null = null
const targetListeners = new Set<() => void>()

export function getWhisperTarget(): ChatSpeaker | null {
  return target
}

export function setWhisperTarget(s: ChatSpeaker | null): void {
  target = s
  for (const l of targetListeners) l()
}

export function subscribeWhisperTarget(fn: () => void): () => void {
  targetListeners.add(fn)
  return () => { targetListeners.delete(fn) }
}
