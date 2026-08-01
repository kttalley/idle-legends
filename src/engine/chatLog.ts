// The chat log — zone chatter and private whispers, as one observable message list.
//
// Deliberately NOT in `gameStore`. Two reasons, and the second is the load-bearing one:
//
//  - The store is already ~2.5k lines and its tick is the hottest path in the game.
//  - Ambient heroes must never touch the player's state. Chat is *their* output, so
//    putting it in the player's store would put ambient behaviour one careless line away
//    from mutating combat, loot or XP. Keeping it in its own module means the isolation
//    rule stays structural rather than remembered.
//
// React subscribes through `useSyncExternalStore`, so the panel re-renders on new
// messages without the store or the render loop knowing this file exists.

export type ChatChannel = 'zone' | 'whisper' | 'system'

export interface ChatMessage {
  id: string
  channel: ChatChannel
  /** Display name of the sender. `null` for system notices. */
  from: string | null
  /** Faction of the sender, for colouring. */
  faction?: 'alliance' | 'horde' | 'neutral'
  /** Stable key of the ambient entity involved, so a whisper thread can be filtered. */
  entityKey?: string
  /** True when the player is the author (their own whisper, echoed back). */
  mine?: boolean
  /** Recipient display name, for the player's own outgoing whispers. A whisper you sent
   *  should read "To [Corvin]", not "To [your own name]". */
  to?: string
  text: string
  ts: number
  /** A whisper awaiting the model's reply — rendered as a typing indicator. */
  pending?: boolean
}

/** Ring buffer bound. Chat is ambience; an unbounded log is a slow memory leak. */
const MAX_MESSAGES = 200

let messages: ChatMessage[] = []
let seq = 0
const listeners = new Set<() => void>()

function emit(): void {
  // A NEW array identity each time, or `useSyncExternalStore` will not see the change.
  messages = messages.slice(-MAX_MESSAGES)
  for (const l of listeners) l()
}

export function subscribeChat(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getChatMessages(): ChatMessage[] {
  return messages
}

export function pushChat(msg: Omit<ChatMessage, 'id' | 'ts'> & { ts?: number }): ChatMessage {
  const full: ChatMessage = { ...msg, id: `c${++seq}`, ts: msg.ts ?? Date.now() }
  messages = [...messages, full]
  emit()
  return full
}

/** Replace a pending message in place — used when a whisper reply finally lands. */
export function resolveChat(id: string, text: string, failed = false): void {
  messages = messages.map(m =>
    m.id === id ? { ...m, text, pending: false, faction: failed ? 'neutral' : m.faction } : m,
  )
  emit()
}

export function clearChat(): void {
  messages = []
  emit()
}
