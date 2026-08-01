// One door to the LLM, with a priority queue behind it.
//
// ── Why this exists ───────────────────────────────────────────────────────────
// Ollama serves one request per model at a time. Everything else is queued *on the
// server*, where we cannot see it or reorder it. That turns out to matter enormously:
// the first version of this feature fired background pool refills (12 lines, ~30s) and
// live per-event barks (~4s) independently, and every live bark that happened to land
// behind a refill sat in the server queue until it hit its own 12s timeout and aborted.
// The symptom looked like "the endpoint is flaky". It was self-inflicted head-of-line
// blocking.
//
// So the client owns the ordering instead. One request in flight, a priority queue in
// front of it, and background work that yields to anything a player can actually
// perceive:
//
//   0 INTERACTIVE — a whisper the player is waiting on. Always first.
//   1 REACTIVE    — a live bark about something that just happened. Short shelf life.
//   2 BACKGROUND  — pool refills. Never dispatched while anything else is waiting, and
//                   cheap enough to abandon.
//
// Backoff is shared too: if the endpoint is unwell, every caller stands down together
// rather than three subsystems independently hammering a box that is already struggling.

export const PRIORITY = { INTERACTIVE: 0, REACTIVE: 1, BACKGROUND: 2 } as const
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY]

const OLLAMA_BASE = import.meta.env.VITE_LLM_URL as string | undefined
export const LLM_MODEL = 'incept5/llama3.1-claude:latest'

export function isLlmReachable(): boolean {
  return typeof OLLAMA_BASE === 'string' && /^https?:\/\//.test(OLLAMA_BASE.trim())
}

export interface GenerateOpts {
  prompt: string
  priority: Priority
  /** Token ceiling. The single biggest lever on latency — 28 tokens ≈ 4s, 300 ≈ 30s. */
  numPredict: number
  stop?: string[]
  temperature?: number
  /** Time budget measured from DISPATCH, not from enqueue: a request that waited its
   *  turn behind others should not be punished for the wait. */
  timeoutMs?: number
  /** Drop this request if it has sat in the queue longer than this. A bark about a kill
   *  is worthless 30 seconds later; better to abandon it than to speak out of turn. */
  staleAfterMs?: number
}

interface QueueItem {
  opts: GenerateOpts
  enqueuedAt: number
  resolve: (s: string) => void
  reject: (e: Error) => void
}

const queue: QueueItem[] = []
let running = false

// Shared health state.
let failures = 0
let nextAttemptAt = 0
const BACKOFF_BASE_MS = 20_000
const BACKOFF_MAX_MS = 10 * 60_000

export function llmBackedOff(): boolean {
  return failures > 0 && Date.now() < nextAttemptAt
}

export function llmHealth(): { failures: number; backoffMs: number; queued: number; busy: boolean } {
  return {
    failures,
    backoffMs: Math.max(0, nextAttemptAt - Date.now()),
    queued: queue.length,
    busy: running,
  }
}

/** True if anything is waiting or running — background work checks this before queueing. */
export function llmBusy(): boolean {
  return running || queue.length > 0
}

function pump(): void {
  if (running) return
  const now = Date.now()

  // Drop anything that waited past its shelf life before picking.
  for (let i = queue.length - 1; i >= 0; i--) {
    const q = queue[i]
    if (q.opts.staleAfterMs && now - q.enqueuedAt > q.opts.staleAfterMs) {
      queue.splice(i, 1)
      q.reject(new Error('stale: dropped before dispatch'))
    }
  }
  if (!queue.length) return

  // Lowest priority number wins; FIFO within a priority.
  let bestIdx = 0
  for (let i = 1; i < queue.length; i++) {
    if (queue[i].opts.priority < queue[bestIdx].opts.priority) bestIdx = i
  }
  const item = queue.splice(bestIdx, 1)[0]

  running = true
  const controller = new AbortController()
  const timeout = item.opts.timeoutMs ?? 20_000
  const timer = setTimeout(() => controller.abort(), timeout)

  void (async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE!.trim()}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: LLM_MODEL,
          prompt: item.opts.prompt,
          stream: false,
          options: {
            temperature: item.opts.temperature ?? 1.0,
            top_p: 0.95,
            num_predict: item.opts.numPredict,
            ...(item.opts.stop ? { stop: item.opts.stop } : {}),
          },
        }),
      })
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
      const data = await res.json()
      failures = 0
      nextAttemptAt = 0
      item.resolve(String(data.response ?? ''))
    } catch (err) {
      failures++
      nextAttemptAt = Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1))
      item.reject(err instanceof Error ? err : new Error(String(err)))
    } finally {
      clearTimeout(timer)
      running = false
      // Keep draining on a fresh task so one slow request cannot build a deep stack.
      if (queue.length) queueMicrotask(pump)
    }
  })()
}

/**
 * Queue a generation. Rejects rather than throwing synchronously; every caller in this
 * codebase treats a rejection as "no line this time" and falls back to canned content.
 */
export function llmGenerate(opts: GenerateOpts): Promise<string> {
  if (!isLlmReachable()) return Promise.reject(new Error('VITE_LLM_URL not configured'))
  // Background work never queues while the endpoint is unwell or busy with real work —
  // it is the first thing to yield and the last thing anyone misses.
  if (opts.priority === PRIORITY.BACKGROUND && (llmBackedOff() || llmBusy())) {
    return Promise.reject(new Error('deferred: endpoint busy or backed off'))
  }
  if (opts.priority !== PRIORITY.INTERACTIVE && llmBackedOff()) {
    return Promise.reject(new Error('backed off'))
  }
  return new Promise<string>((resolve, reject) => {
    queue.push({ opts, enqueuedAt: Date.now(), resolve, reject })
    pump()
  })
}
