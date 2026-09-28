// Makes native <input type="date"> fields open their picker when the user
// clicks anywhere inside the field - not only on the small calendar icon.
//
// The native calendar indicator (right ~30px of the field) already opens the
// picker by itself, so clicks landing there are skipped to avoid an
// open/close flicker from calling showPicker() twice.
//
// Cross-browser: WebKit/Blink (Chrome, Edge, Safari) expose showPicker() to
// open the calendar programmatically, but Firefox does not. For Firefox we
// fall back to el.click(), which opens the picker during an active user
// gesture. The e.isTrusted guard ignores the synthetic click that fallback
// dispatches so it cannot recurse into this handler.
//
// Uses event delegation on `document` (capture phase), so every date input
// in the app - Projects, Finance, Reports and any other module - gets this
// behaviour with zero per-field wiring.
const INDICATOR_WIDTH = 30; // px measured from the right edge of the field

export function initDateFieldClick() {
  if (typeof document === "undefined") return;

  document.addEventListener(
    "click",
    (e) => {
      // Only act on real user clicks — our own el.click() fallback below
      // synthesizes an untrusted click, which we must ignore to avoid an
      // infinite loop.
      if (!e.isTrusted) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('input[type="date"]');
      if (!el) return;
      if (el.disabled || el.readOnly) return;

      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.right - INDICATOR_WIDTH) return; // native indicator

      // WebKit/Blink browsers: open the picker programmatically.
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
          return;
        } catch (_) {
          // NotAllowedError (not a user gesture) / already open - fall through
        }
      }

      // Firefox has no showPicker(): simulate a native click, which opens the
      // picker while the user gesture from this handler is still active.
      try {
        el.click();
      } catch (_) {
        // ignore
      }
    },
    true // capture phase: runs even if a module stops event propagation
  );

  // Prevent manual typing into any date field, on every page, so users always
  // pick a date via the calendar instead of typing it. Uses capture-phase
  // delegation on `document`, so it applies to every <input type="date"> in
  // the app (filter bars, forms, tables) without per-field wiring and survives
  // React re-renders. Navigation/picker keys stay allowed.
  const NAV_KEYS = [
    "Tab", "Enter", "Escape", "F4", " ",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageUp", "PageDown", "Delete", "Backspace", "Clear",
  ];

  document.addEventListener(
    "keydown",
    (e) => {
      if (!e.isTrusted) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('input[type="date"]');
      if (!el || el.disabled || el.readOnly) return;

      // Allow keys used for navigation, picker access and clearing, but block
      // everything that would type/insert a date character.
      if (NAV_KEYS.includes(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // shortcuts (e.g. Ctrl+Z, Ctrl+C)

      e.preventDefault();
    },
    true
  );
}
