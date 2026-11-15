/** The bottom sheet of the phone app shell (`.tds-sheet`). Re-exported from `./app`. */
import { lockBodyScroll, MOBILE_NAV_DESKTOP_QUERY } from "../nav/index.js";

export interface SheetOptions {
  /** The `<dialog class="tds-sheet">`. */
  dialog: HTMLDialogElement;
  /** Buttons that open it. Get `aria-haspopup="dialog"` + `aria-expanded`. */
  triggers?: HTMLElement[];
  /** Called after it opened (e.g. focus a search field). */
  onOpen?(): void;
}

export interface SheetHandle {
  open(trigger?: HTMLElement): void;
  close(): void;
  destroy(): void;
}

/** Pixels the grab area must travel before a drag starts — below it, a tap stays a click. */
const DRAG_SLOP = 6;
/** Released below this far (or flicked), the sheet closes. */
const DISMISS_DISTANCE = 90;

/**
 * Wire a bottom sheet: open from its triggers, close on the backdrop, on
 * Escape (native for a modal dialog), on any `[data-sheet-close]`, by
 * dragging the grab area down, and when the window grows past the phone
 * breakpoint. Joins the counted scroll lock, and hands focus back to the
 * trigger that opened it.
 *
 * Pointer capture starts only after {@link DRAG_SLOP} pixels: capturing on
 * `pointerdown` swallows the click on the close button inside the grab area.
 */
export function mountSheet(options: SheetOptions): SheetHandle {
  const { dialog, triggers = [], onOpen } = options;
  if (typeof window === "undefined" || typeof dialog.showModal !== "function") {
    return { open() {}, close() {}, destroy() {} };
  }
  let release: (() => void) | null = null;
  let opener: HTMLElement | null = null;
  const off: Array<() => void> = [];
  // `(e: never) => void` accepts any concrete handler (MouseEvent,
  // PointerEvent…) without widening every call site to Event.
  const on = (el: EventTarget, type: string, fn: (e: never) => void) => {
    el.addEventListener(type, fn as EventListener);
    off.push(() => el.removeEventListener(type, fn as EventListener));
  };

  const setExpanded = (value: boolean) => {
    for (const t of triggers) t.setAttribute("aria-expanded", String(value));
  };

  const open = (trigger?: HTMLElement) => {
    if (dialog.open) return;
    opener = trigger ?? (document.activeElement as HTMLElement | null);
    // Swipe in from the side the trigger sits on; a centred trigger keeps the
    // sheet's rise from the bottom.
    const rect = trigger?.getBoundingClientRect();
    if (rect && window.innerWidth > 0) {
      const centre = (rect.left + rect.right) / 2 / window.innerWidth;
      if (centre < 0.42) dialog.dataset.from = "left";
      else if (centre > 0.58) dialog.dataset.from = "right";
      else delete dialog.dataset.from;
    }
    dialog.classList.remove("is-closing");
    dialog.style.transform = "";
    dialog.showModal();
    release = lockBodyScroll();
    setExpanded(true);
    onOpen?.();
  };

  const finish = () => {
    release?.();
    release = null;
    setExpanded(false);
    dialog.classList.remove("is-closing");
    dialog.style.transform = "";
    // preventScroll: the page under a sheet must not jump to the trigger.
    opener?.focus?.({ preventScroll: true });
    opener = null;
  };

  const close = () => {
    if (!dialog.open) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    window.setTimeout(() => dialog.close(), 170);
  };

  for (const t of triggers) {
    t.setAttribute("aria-haspopup", "dialog");
    t.setAttribute("aria-expanded", "false");
    on(t, "click", (e: MouseEvent) => {
      e.preventDefault();
      open(t);
    });
  }
  // `close` fires for Escape, form[method=dialog] and our own close().
  on(dialog, "close", finish);
  // A click on the ::backdrop arrives with the dialog itself as target.
  on(dialog, "click", (e: MouseEvent) => {
    if (e.target === dialog) close();
    else if ((e.target as HTMLElement).closest?.("[data-sheet-close]")) close();
  });
  // Links inside navigate normally; just get out of the way.
  on(dialog, "click", (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest?.("a[href]");
    if (link && !link.hasAttribute("data-sheet-keep")) close();
  });

  // Drag to dismiss, from the grab area only (the body scrolls).
  const grab = dialog.querySelector<HTMLElement>(".tds-sheet__grab");
  if (grab) {
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let dragging = false;
    let pointerId: number | null = null;
    on(grab, "pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      startT = e.timeStamp;
      dy = 0;
      dragging = false;
    });
    on(grab, "pointermove", (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      dy = Math.max(0, e.clientY - startY);
      if (!dragging && dy > DRAG_SLOP) {
        dragging = true;
        dialog.classList.add("is-dragging");
        try {
          grab.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      }
      if (dragging) dialog.style.transform = `translateY(${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      dialog.classList.remove("is-dragging");
      const velocity = dy / Math.max(1, e.timeStamp - startT);
      if (dy > DISMISS_DISTANCE || velocity > 0.6) close();
      else dialog.style.transform = "";
    };
    on(grab, "pointerup", end);
    on(grab, "pointercancel", end);
  }

  const mq = window.matchMedia?.(MOBILE_NAV_DESKTOP_QUERY);
  if (mq) {
    on(mq, "change", () => {
      if (mq.matches && dialog.open) dialog.close();
    });
  }

  return {
    open,
    close,
    destroy() {
      for (const f of off.splice(0)) f();
      if (dialog.open) dialog.close();
      release?.();
    },
  };
}

