import React from 'react'
import {
  acceptTerms, PRIVACY_URL, SUPPORT_EMAIL, TERMS_SUMMARY, TERMS_URL,
} from '../../moderation/terms'

/**
 * The terms gate — the first screen of a first launch.
 *
 * Required by App Review 1.2 ("require that users agree to terms (EULA)... presented before
 * registering or logging in"). Stillmarch has no login screen; the Supabase session is
 * created anonymously the first time the cloud is touched. So this sits ahead of character
 * select, which is the earliest moment there is.
 *
 * ── Three things it deliberately does NOT do ────────────────────────────────
 *  • **No dismiss.** No escape key, no scrim tap, no back. Agreeing is the only way past,
 *    which is what "require that users agree" means. A gate with a way around it is a
 *    notice, and Apple has already rejected this app once for the difference.
 *  • **No pre-ticked box.** The button is the consent.
 *  • **No scroll-to-the-bottom trap.** The no-tolerance clause is the FIRST thing on
 *    screen, in full, above the fold. It is the specific clause the guideline is about,
 *    and it should not require scrolling to reach.
 */
export function TermsGate({ onAccept }: { onAccept: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Terms of Use"
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--ink)',
        padding: 'calc(18px + var(--safe-t)) 16px calc(18px + var(--safe-b))',
      }}
    >
      <div
        className="rp-glass"
        style={{
          width: 'min(420px, 94vw)', maxHeight: '100%', borderRadius: 12, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--gold)' }}>
            Terms of Use
          </div>
          <div style={{ fontSize: '0.55rem', color: '#9a9086', marginTop: 2 }}>
            Please read before you play. You must agree to continue.
          </div>
        </div>

        {/* The list scrolls, the header and the button do not — so the accept control can
            never be pushed off a small screen by long text. */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          {TERMS_SUMMARY.map(clause => (
            <div key={clause.title}>
              <div style={{ fontSize: '0.62rem', color: 'var(--gold-soft)', marginBottom: 3 }}>
                {clause.title}
              </div>
              <div style={{ fontSize: '0.58rem', color: 'var(--parchment)', lineHeight: 1.55 }}>
                {clause.body}
              </div>
            </div>
          ))}

          <div style={{ fontSize: '0.55rem', color: '#9a9086', lineHeight: 1.55 }}>
            Full terms: <a href={TERMS_URL} target="_blank" rel="noreferrer"
              style={{ color: 'var(--gold-soft)' }}>{TERMS_URL}</a>
            <br />
            Privacy: <a href={PRIVACY_URL} target="_blank" rel="noreferrer"
              style={{ color: 'var(--gold-soft)' }}>{PRIVACY_URL}</a>
            <br />
            Report abuse: <a href={`mailto:${SUPPORT_EMAIL}`}
              style={{ color: 'var(--gold-soft)' }}>{SUPPORT_EMAIL}</a>
          </div>
        </div>

        <button
          className="rp-button"
          onClick={() => { acceptTerms(); onAccept() }}
          style={{ fontSize: '0.7rem', minHeight: 44, flex: '0 0 auto' }}
        >
          I agree
        </button>
      </div>
    </div>
  )
}
