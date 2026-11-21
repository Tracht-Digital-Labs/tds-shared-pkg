import type { Theme } from "../design/index.js";
import { applyThemePreference, currentTheme } from "./index.js";
import { cssEase } from "../motion/index.js";
import { buildClone, mirrorAttributes } from "./previewClone.js";

/**
 * The theme toggle's behaviour, without a framework (0.60).
 *
 * Both the React `ThemeToggle` and the plain-DOM toggle the public sites render
 * (`./dom`, `themeToggleMarkup` + `mountThemeToggles`) attach this to their
 * `<button>`, so the flip, the View Transition and the hover preview exist
 * once. The public sites used the React island only for this button, and a
 * React island costs every article page the whole React runtime
 * (tds-blog-frontend#27).
 *
 * What it does on a click: flips `<html data-theme>` through
 * `applyThemePreference` (the single write path — storage, attribute and the
 * `tds:theme-change` announcement), animated as a View Transition when the
 * browser has them and the visitor has not asked for reduced motion: a circle
 * growing from the button on a fine pointer, a curtain from the top on a
 * coarse one (see the note at that branch). Otherwise it flips instantly and
 * the token transition gives a soft colour crossfade.
 *
 * On a fine pointer, hovering the button also PREVIEWS the flip: a circular
 * region follows the cursor and shows where the page is going. See
 * `.tds-theme-preview` in base.css for the shape, and the note there on why it
 * is a gradient rather than a `clip-path`.
 */
export interface ThemeToggleOptions {
  /**
   * Runs the theme change. The React twin wraps it in `flushSync`, so its icon
   * state commits before the View Transition takes its snapshot. Default: call
   * it.
   */
  commit?: (apply: () => void) => void;
}



/**
 * Wire one toggle button. Returns the teardown, which also removes a preview
 * still on screen — it is a child of `document.body`, so nothing else would.
 */
export function attachThemeToggle(
  button: HTMLButtonElement,
  { commit = (apply) => apply() }: ThemeToggleOptions = {},
): () => void {
  // --- Preview under the pointer --------------------------------------
  // `preview` holds the element for as long as it is IN THE DOM, fading
  // included — not only while it is wanted. The distinction is load-bearing
  // twice over: a pointer that re-enters during the fade reuses the element
  // instead of stacking a second one over it, and a teardown during the fade
  // still has something to remove.
  //
  // Plain variables, no framework state: a `pointermove` fires many times per
  // frame and re-rendering anything on each one would be the most expensive
  // way imaginable to move a background.
  let preview: HTMLDivElement | null = null;
  let frame = 0;
  let removeTimer = 0;
  let point = { x: 0, y: 0 };
  let stopMirror = () => {};

  /** Lines the clone up with the real page at the current scroll position. */
  const alignClone = () => {
    const page = preview?.firstElementChild as HTMLElement | null;
    if (page) page.style.top = `${-window.scrollY}px`;
  };

  const paintPreview = () => {
    frame = 0;
    if (!preview) return;
    preview.style.setProperty("--tds-theme-preview-x", `${point.x}px`);
    preview.style.setProperty("--tds-theme-preview-y", `${point.y}px`);
  };

  const trackPointer = (event: PointerEvent) => {
    point = { x: event.clientX, y: event.clientY };
    if (!preview || frame) return;
    frame = requestAnimationFrame(paintPreview);
  };

  const discardPreview = () => {
    if (removeTimer) {
      clearTimeout(removeTimer);
      removeTimer = 0;
    }
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    stopMirror();
    stopMirror = () => {};
    preview?.remove();
    preview = null;
  };

  const closePreview = () => {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (!preview || removeTimer) return;
    preview.removeAttribute("data-visible");
    // A timer rather than `transitionend`: a pointer that entered and left
    // inside one frame never reached opacity 1, so no transition runs and no
    // event arrives — and an overlay left behind is invisible, permanent and
    // sits over the whole page.
    //
    // The duration comes from the element's own computed style, so the CSS
    // stays the single source of truth. `40` is the margin for the frame the
    // attribute removal lands on; the fallback covers a detached document.
    const fade = parseFloat(getComputedStyle(preview).transitionDuration) || 0.2;
    removeTimer = window.setTimeout(discardPreview, fade * 1000 + 40);
  };

  const openPreview = (event: PointerEvent) => {
    // Nothing on a touch screen: there is no hover state to preview under, a
    // finger covers the circle it would draw, and the tap flips the theme for
    // real a moment later.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen — either still shown (a second `pointerenter` without
    // a leave) or mid-fade. Either way, take it back rather than build another.
    let el = preview;
    if (el) {
      if (removeTimer) {
        clearTimeout(removeTimer);
        removeTimer = 0;
      }
    } else {
      el = document.createElement("div");
      el.className = "tds-theme-preview";
      el.setAttribute("aria-hidden", "true");
      // The target theme is read from the DOCUMENT at this moment. Any other
      // writer — the profile page, `startSystemThemeSync` following the OS,
      // another tab, the panel host restoring a per-user choice — may have
      // changed it since, and a copy built in the theme the page is ALREADY
      // in shows no difference at all.
      const clone = buildClone(currentTheme() === "dark" ? "light" : "dark");
      el.appendChild(clone.page);
      document.body.appendChild(el);
      clone.restoreScroll();
      stopMirror = mirrorAttributes(clone.twins);
      preview = el;
    }
    // Place it BEFORE it becomes visible, or the first frame fades in at the
    // centre of the viewport and slides to the cursor.
    point = { x: event.clientX, y: event.clientY };
    paintPreview();
    alignClone();
    const target = el;
    requestAnimationFrame(() => {
      if (preview === target) target.setAttribute("data-visible", "true");
    });
  };

  const flip = () => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    // The icon turns when the visitor flips the theme, and never on load. The
    // class restarts its animation because the icons swap with `display`.
    for (const icon of button.querySelectorAll("svg")) icon.classList.add("tds-theme-toggle__icon--turn");
    // The real transition is about to run over the whole viewport; a preview
    // of it still lying on top would darken its destination.
    closePreview();

    // The toggle only ever writes an explicit theme; "System" is chosen on the
    // profile page.
    const apply = () => commit(() => applyThemePreference(next));

    const startViewTransition = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void> };
      }
    ).startViewTransition;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // No View Transitions support or reduced motion: flip instantly. The token
    // transition in base.css still gives a soft colour crossfade.
    if (!startViewTransition || prefersReduced) {
      apply();
      return;
    }

    // Touch devices get a DIFFERENT reveal, and the reason is the compositor,
    // not taste: `clip-path` is not a compositor-animatable property in
    // Chromium, so every frame of the circular wipe repaints a full-viewport
    // layer. On a desktop GPU that disappears; on a phone the wipe visibly
    // stutters — worst on exactly the pages with a frosted fixed header and
    // large soft fields underneath. `opacity` and `transform` ARE composited.
    //
    // Chosen on pointer, not on width: a small window on a desktop has the GPU
    // to spare, and a large tablet does not.
    if (window.matchMedia("(pointer: coarse)").matches) {
      const transition = startViewTransition.call(document, apply);

      // A CURTAIN, from the top edge the toggle sits on. The new snapshot drops
      // in from above with a small overshoot and the old one gives way
      // downwards underneath it. Both are `transform` only, so the compositor
      // moves two finished bitmaps and nothing repaints. The old snapshot
      // travels 10 % while the new one travels 100 %, and the new one leads,
      // so no gap opens between the falling edge and the page it covers.
      transition.ready.then(() => {
        document.documentElement.animate(
          [
            { transform: "translateY(-100%)" },
            { transform: "translateY(1.5%)", offset: 0.78 },
            { transform: "translateY(0)" },
          ],
          { duration: 560, easing: cssEase.out, pseudoElement: "::view-transition-new(root)" },
        );
        document.documentElement.animate(
          { transform: ["translateY(0)", "translateY(10%)"] },
          { duration: 560, easing: cssEase.inOut, pseudoElement: "::view-transition-old(root)" },
        );
      });
      return;
    }

    // Circular reveal from the centre of the button to the farthest corner.
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = startViewTransition.call(document, apply);
    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
        {
          // Deliberately longer than `--tds-dur-slow`: this is a full-viewport
          // wipe, not a control's response, and it reads as abrupt below ~450ms.
          duration: 480,
          easing: cssEase.inOut,
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  };

  // `pointerenter`/`pointerleave` do not bubble and never fire for a move
  // between the button's own children (the two SVGs) — exactly the semantics
  // wanted here.
  const onScroll = () => {
    // A page that scrolls while the preview is open would slide out from under
    // the copy. Passive and a no-op whenever nothing is open.
    if (preview) alignClone();
  };
  button.addEventListener("click", flip);
  button.addEventListener("pointerenter", openPreview);
  button.addEventListener("pointermove", trackPointer);
  button.addEventListener("pointerleave", closePreview);
  button.addEventListener("pointercancel", closePreview);
  // Keyboard focus leaving the button ends the preview too. A pointer parked
  // on the toggle while the visitor tabs away is the one case `pointerleave`
  // never fires for.
  button.addEventListener("blur", closePreview);
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    window.removeEventListener("scroll", onScroll);
    button.removeEventListener("click", flip);
    button.removeEventListener("pointerenter", openPreview);
    button.removeEventListener("pointermove", trackPointer);
    button.removeEventListener("pointerleave", closePreview);
    button.removeEventListener("pointercancel", closePreview);
    button.removeEventListener("blur", closePreview);
    // Immediately, fade or no fade — nothing is left to watch it finish.
    discardPreview();
  };
}

/** The two icons, shared by the React toggle and `../dom`, so both draw the same. */
export const MOON_PATH = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z";
export const SUN_RAYS: readonly (readonly [number, number, number, number])[] = [
  [12, 2, 12, 5],
  [12, 19, 12, 22],
  [2, 12, 5, 12],
  [19, 12, 22, 12],
  [4.93, 4.93, 6.99, 6.99],
  [17.01, 17.01, 19.07, 19.07],
  [4.93, 19.07, 6.99, 17.01],
  [17.01, 6.99, 19.07, 4.93],
];
