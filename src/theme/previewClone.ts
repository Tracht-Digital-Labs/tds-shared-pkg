/**
 * The theme toggle's hover preview: a copy of the page in the target theme,
 * with running animations frozen where they are. Used by `./toggle`.
 */
import type { Theme } from "../design/index.js";

/** A scrolled box in the copy and the offsets its original had. */
type ScrollState = [copy: Element, left: number, top: number];

/** How an animated element's copy is pinned: its current value, or where the animation ends. */
type Pin = "current" | Keyframe;

const PINNED = ["transform", "translate", "rotate", "scale", "opacity"] as const;

/**
 * What to pin for each animated element (2026-11-03).
 *
 * - A CSS **transition** is not pinned at all. The copy carries the same
 *   attributes and inline styles, and transitions are off inside it, so it
 *   renders the transition's END state by itself. Pinning it froze a scroll
 *   reveal mid-way, or at `opacity: 0` while its stagger delay was still
 *   running: the cards that had just come into view were missing from the
 *   circle ("Komponenten, die erst auftauchen, werden nicht im Hover-Theme
 *   angezeigt").
 * - A **finite, time-based** animation that is running (an entrance) is pinned
 *   at its LAST keyframe, for the same reason: the real one arrives there a
 *   moment later.
 * - A **scroll-driven** animation (`animation-timeline: view()`) is pinned at
 *   its current value: its "end" is a scroll position, not a moment. Pinning
 *   it at the last keyframe lifted the landingpage's hero carousel by 72px in
 *   the circle ("das andere Theme mit verschobenen Komponenten").
 * - An **endless** animation (the floating hero shapes) is pinned at its
 *   current value, so the copy lines up with what is on screen.
 */
function collectPins(): Map<Element, Pin> {
  const pins = new Map<Element, Pin>();
  for (const animation of document.getAnimations?.() ?? []) {
    const effect = animation.effect as KeyframeEffect | null;
    const element = effect?.target;
    if (!element) continue;
    if ("transitionProperty" in animation) continue;
    const iterations = effect.getComputedTiming?.().iterations ?? Infinity;
    const timeBased =
      typeof DocumentTimeline === "undefined" || !animation.timeline || animation.timeline instanceof DocumentTimeline;
    const entering = Number.isFinite(iterations) && timeBased && animation.playState === "running";
    const frames = entering ? (effect.getKeyframes?.() ?? []) : [];
    const last = frames[frames.length - 1];
    if (last && PINNED.some((key) => key in last)) {
      if (!pins.has(element)) pins.set(element, last);
    } else {
      pins.set(element, "current");
    }
  }
  return pins;
}

/**
 * Carries over the state `cloneNode` leaves behind. Walks the original and the
 * copy in parallel — they have the same shape, because nothing has been
 * stripped yet.
 *
 *  - Running animations: the CURRENT animated transform and opacity, inline.
 *  - Scroll offsets of inner scroll boxes (a carousel, a code block). They can
 *    only be applied once the copy is in the document, so they are collected.
 */
function syncCloneState(
  original: Element,
  copy: Element,
  pins: Map<Element, Pin>,
  scrolled: ScrollState[],
  twins: Map<Element, Element>,
): void {
  twins.set(original, copy);
  if (original.scrollLeft || original.scrollTop) {
    scrolled.push([copy, original.scrollLeft, original.scrollTop]);
  }
  const pin = pins.get(original);
  if (pin && (copy instanceof HTMLElement || copy instanceof SVGElement)) {
    const style = copy.style;
    if (pin === "current") {
      const cs = getComputedStyle(original);
      for (const key of PINNED) style.setProperty(key, cs[key]);
    } else {
      for (const key of PINNED) {
        const value = pin[key];
        if (value != null) style.setProperty(key, String(value));
      }
    }
  }
  const a = original.children;
  const b = copy.children;
  for (let i = 0; i < a.length && i < b.length; i++) syncCloneState(a[i]!, b[i]!, pins, scrolled, twins);
}

/**
 * Keeps the copy's attributes in step with the page while the preview is open
 * (2026-11-03). The toggle sits in fixed chrome, so a visitor can scroll with
 * the pointer still on it: sections reveal (`data-revealed`), a header turns
 * solid (`data-scrolled`), and the copy taken at `pointerenter` showed none of
 * it. Attributes only — the structure is the one from the hover's start.
 * Returns the disconnect.
 */
export function mirrorAttributes(twins: Map<Element, Element>): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const copy = twins.get(record.target as Element);
      const name = record.attributeName;
      if (!copy || !name || name === "name") continue;
      const value = (record.target as Element).getAttribute(name);
      if (value === null) copy.removeAttribute(name);
      else copy.setAttribute(name, value);
    }
  });
  observer.observe(document.body, { attributes: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * A copy of the page, in the TARGET theme.
 *
 * This is what makes the region read as the real dark mode rather than as a
 * dark sheet over the light one (asked for 2026-09-30, after a flat fill was
 * tried first). The dark tokens reach it because `base.css` matches a bare
 * `[data-theme="dark"]` as well as `:root[…]` — see the long note there,
 * including what it cannot reach (Tailwind's non-arbitrary utilities compile
 * their colours as literals).
 *
 * `<body>`'s CHILDREN, not `<body>` itself: cloning the body element would put
 * a second `<body>` inside a `<div>`, which the parser is entitled to move.
 * The wrapper paints `--color-paper` for the same reason — the page background
 * lives on `<body>` and does not come with the children.
 *
 * What is stripped, and why each one matters:
 *  - `name` on form controls, so a cloned radio group cannot steal the
 *    selection of the real one.
 *  - `<script>`, `<style id>` and `<link>`: a clone must not re-run or
 *    re-register anything. (`cloneNode` does not execute scripts, but a
 *    `<script>` moved into the document by `appendChild` would.)
 *  - `inert` + `aria-hidden` on the overlay, so nothing inside is focusable or
 *    announced.
 *
 * ### `id`s are KEPT (2026-10-07)
 *
 * They used to be stripped, to keep ids unique. That cost every stylesheet
 * rule written against an id — the landingpage's whole contact section is
 * `#contact .contact-…` — so inside the circle those elements fell back to
 * browser defaults, wrapped differently, and everything below them slid out
 * of line with the real page ("die Darkmode-Preview wird verschoben
 * angezeigt"; measured: 1090 misplaced elements on the landingpage, 11 with
 * the ids kept). The duplicates are harmless because of ORDER: the overlay
 * is appended as the last child of `<body>`, and `getElementById`,
 * `querySelector`, `<label for>` and every `aria-*` reference resolve to the
 * FIRST match in tree order — the real element. The copy lives for one hover.
 *
 * ### Running animations are frozen, not reset
 *
 * `animation: none` inside the copy (base.css) would snap an animated element
 * back to its resting transform — the landingpage's floating hero shapes sat
 * 60px away from the real ones. Each animated element's copy takes the
 * current computed transform and opacity as inline style instead.
 *
 * ### `data-theme-preview="skip"`
 *
 * A consumer can keep an element out of the copy. There is one kind that has
 * to be: chrome a script POSITIONS, rather than chrome the layout places. The
 * landingpage's custom cursor is two `position: fixed` dots moved by a
 * transform on every `mousemove` — cloned, they freeze at wherever they were
 * when the copy was taken and render a second, stuck cursor inside the circle.
 * Reported as "der Pointer geht stuck, wenn man über die modes hovert".
 *
 * Fixed chrome the layout places (a bar, a floating pill, the bookmarks) is
 * NOT skipped: it sits at the same viewport position in the copy, so inside
 * the circle it correctly appears in the other theme.
 *
 * It is deliberately built once per hover and thrown away on leave. Caching it
 * across hovers would mean tracking every DOM change on the page for the sake
 * of a preview.
 */
export function buildClone(target: Theme): {
  page: HTMLElement;
  restoreScroll: () => void;
  twins: Map<Element, Element>;
} {
  const page = document.createElement("div");
  page.className = "tds-theme-preview__page";
  page.setAttribute("data-theme", target);
  const pins = collectPins();
  const scrolled: ScrollState[] = [];
  const twins = new Map<Element, Element>();
  for (const node of Array.from(document.body.children)) {
    // The overlay itself is a child of body by the time a second one opens.
    if (node instanceof HTMLElement && node.classList.contains("tds-theme-preview")) continue;
    if (node.tagName === "SCRIPT" || node.tagName === "LINK") continue;
    if (node instanceof HTMLElement && node.dataset.themePreview === "skip") continue;
    const copy = node.cloneNode(true) as Element;
    syncCloneState(node, copy, pins, scrolled, twins);
    page.appendChild(copy);
  }
  for (const stray of page.querySelectorAll('script, link, [name], [data-theme-preview="skip"], .tds-hover-tip')) {
    if (
      stray.tagName === "SCRIPT" ||
      stray.tagName === "LINK" ||
      // The hover tip lives in the top layer as an open popover; a copy is not
      // open and would paint at the page's corner inside the circle.
      stray.classList.contains("tds-hover-tip") ||
      (stray as HTMLElement).dataset?.themePreview === "skip"
    ) {
      stray.remove();
      continue;
    }
    stray.removeAttribute("name");
  }
  page.inert = true;
  // Scroll offsets take effect only in the document: the caller runs this
  // after appending the overlay. `instant`, or a `scroll-behavior: smooth`
  // box would glide into place inside the circle.
  const restoreScroll = () => {
    for (const [copy, left, top] of scrolled) copy.scrollTo?.({ left, top, behavior: "instant" });
  };
  return { page, restoreScroll, twins };
}
