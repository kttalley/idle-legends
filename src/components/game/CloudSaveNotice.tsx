import React, { useCallback, useEffect, useState } from 'react'
import { slotStorage } from '../../store/saveSlots'
import { cloudEnabled } from '../../net/cloudConfig'
import {
  fetchCloudSlots, reconcile, rowToSlot, type CloudSaveRow, type SlotVerdict,
} from '../../net/cloudSave'

// ── "Your characters are backed up" ───────────────────────────────────────────
//
// The character-select screen is the only correct place for this. It is the one moment the
// player is not mid-run, so it is the only moment a restore cannot destroy something they
// are in the middle of — and it is where a character that has gone missing is noticed.
//
// Two outcomes, and the difference between them is the whole safety argument:
//
//   • A cloud slot with no local counterpart is RESTORED silently. That is the eviction
//     case this feature exists for: there is nothing to overwrite, so asking would only be
//     asking whether the player would like their deleted character back.
//
//   • A cloud slot that is FURTHER ALONG than its local counterpart is offered, never
//     applied. Two devices both played offline and one has to lose; that is the player's
//     call, not ours. Silently replacing a character with a version from another device is
//     worse than the data loss this whole system is meant to prevent.
//
// Anything where local is level or ahead never appears — there is nothing to say, and the
// next autosave brings the cloud into line on its own.

function hhmm(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function CloudSaveNotice({ onSlotsChanged }: { onSlotsChanged: () => void }) {
  const [conflicts, setConflicts] = useState<SlotVerdict[]>([])
  const [restored, setRestored] = useState(0)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!cloudEnabled()) return
    let cancelled = false

    void (async () => {
      const res = await fetchCloudSlots()
      if (cancelled || !res.ok || res.data.length === 0) return

      // Local play time lives inside the blob rather than in the slot's card data, so this
      // reads each slot in full. That is a real cost and it is paid HERE on purpose: the
      // select screen is idle, whereas doing it during play would parse the saves file on
      // a loop.
      const local = slotStorage.list().map(meta => {
        const full = slotStorage.load(meta.id)
        return {
          id: meta.id,
          playTime: full?.state?.totalPlayTime ?? 0,
          name: meta.summary.playerName ?? '',
        }
      })

      const verdicts = reconcile(res.data, local)
      let restoredCount = 0
      for (const v of verdicts) {
        if (v.kind !== 'restore') continue
        // Straight through the same writer the game uses, so a restored character goes
        // through exactly the path a local one does — including `rehydrateState` on load,
        // which is what regenerates the world maps the blob deliberately does not carry.
        if (slotStorage.save(rowToSlot(v.row))) restoredCount++
      }
      if (cancelled) return
      if (restoredCount > 0) {
        setRestored(restoredCount)
        onSlotsChanged()
      }
      setConflicts(verdicts.filter(v => v.kind === 'conflict'))
    })()

    return () => { cancelled = true }
  }, [onSlotsChanged])

  const takeCloud = useCallback((row: CloudSaveRow) => {
    slotStorage.save(rowToSlot(row))
    setDismissed(prev => new Set(prev).add(row.slot_id))
    onSlotsChanged()
  }, [onSlotsChanged])

  const keepLocal = useCallback((row: CloudSaveRow) => {
    // Nothing to write. The local save is untouched and the next autosave overwrites the
    // cloud row with it, which is what "keep this one" means.
    setDismissed(prev => new Set(prev).add(row.slot_id))
  }, [])

  const open = conflicts.filter(v => v.kind === 'conflict' && !dismissed.has(v.row.slot_id))
  if (restored === 0 && open.length === 0) return null

  return (
    <div style={{ width: '100%', maxWidth: 520, marginBottom: 16 }}>
      {restored > 0 && (
        <div style={{
          border: '1px solid var(--edge-soft)', borderRadius: 8, padding: '10px 12px',
          background: 'rgba(30,50,35,0.55)', color: '#9fd6b0', fontSize: '0.78rem',
          marginBottom: 8,
        }}>
          ☁ Restored {restored} character{restored === 1 ? '' : 's'} from the cloud.
        </div>
      )}

      {open.map(v => {
        if (v.kind !== 'conflict') return null
        const { row, localPlayTime, localName } = v
        return (
          <div
            key={row.slot_id}
            style={{
              border: '1px solid var(--edge-soft)', borderRadius: 8, padding: '10px 12px',
              background: 'rgba(45,38,20,0.7)', marginBottom: 8,
            }}
          >
            <div style={{ color: 'var(--gold-warm)', fontSize: '0.82rem', fontWeight: 700 }}>
              ☁ A cloud save is further along
            </div>
            <div style={{ color: 'var(--parchment)', fontSize: '0.74rem', marginTop: 4 }}>
              {row.hero_name || localName}: the cloud has <strong>{hhmm(row.play_time)}</strong> played
              (level {row.level}), this device has <strong>{hhmm(localPlayTime)}</strong>.
            </div>
            <div style={{ color: 'var(--muted-warm)', fontSize: '0.68rem', marginTop: 3 }}>
              Restoring replaces the copy on this device. Nothing is changed until you choose.
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => takeCloud(row)}
                className="rp-button"
                style={{ flex: 1, fontSize: '0.72rem', minHeight: 36 }}
              >Restore cloud save</button>
              <button
                onClick={() => keepLocal(row)}
                className="rp-button"
                style={{ flex: 1, fontSize: '0.72rem', minHeight: 36 }}
              >Keep this device's</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
