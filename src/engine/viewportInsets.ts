// Keyboard-aware viewport insets, for iOS.
//
// On iOS Safari the software keyboard does NOT change `window.innerHeight`. A
// `position: fixed` element anchored to `bottom` therefore stays exactly where it was —
// underneath the keyboard — and the text field you are typing into becomes invisible the
// moment you focus it. `100dvh` does not save you either: it tracks the layout viewport,
// not the visual one.
//
// The visual viewport is the only thing that knows. This publishes the keyboard's height
// as `--kb-inset` on the document element, so any fixed panel can simply add it to its
// `bottom` and ride above the keyboard.
//
// Everything is guarded: browsers without `visualViewport` (and SSR) just keep 0px, which
// is the correct answer for a platform whose keyboard resizes the layout viewport anyway.

let installed = false

export function installViewportInsets(): () => void {
  if (installed || typeof window === 'undefined') return () => {}
  const vv = window.visualViewport
  if (!vv) return () => {}
  installed = true

  const apply = () => {
    // How much of the layout viewport the visual viewport no longer covers at the bottom.
    // `offsetTop` matters when the page is scrolled by the focus, otherwise the keyboard
    // height is double-counted.
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    // Ignore hairline differences (URL bar shrink, rounding) so we don't thrash layout.
    document.documentElement.style.setProperty('--kb-inset', hidden > 24 ? `${Math.round(hidden)}px` : '0px')
  }

  apply()
  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  return () => {
    vv.removeEventListener('resize', apply)
    vv.removeEventListener('scroll', apply)
    document.documentElement.style.setProperty('--kb-inset', '0px')
    installed = false
  }
}
