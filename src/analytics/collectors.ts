/**
 * One collector per thing the tracker measures. Each installs its own
 * listeners on a {@link Tracker}, keeps its own page-scoped state and resets
 * it on every page view (including a back/forward-cache restore).
 */
import type { AnalyticsEvent } from "./types";

/** What a collector may do with the running tracker. */
export interface Tracker {
  /** Queue an event for the current path. */
  push(event: Omit<AnalyticsEvent, "p">): void;
  /** Send the queue within a second. */
  flushSoon(): void;
  /** Send the queue now. */
  flush(): void;
  /** Count a page view and reset every collector's page-scoped state. */
  pageview(): void;
  /** Add a listener that is removed when the tracker stops. */
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  /** Run after each page view has been queued. */
  onPageview(fn: () => void): void;
  /** Run when the tracker stops. */
  onStop(fn: () => void): void;
}

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const SCROLL_MILESTONES = [25, 50, 75, 100] as const;
/** Upper bound for one engaged-time report; a tab left open overnight is not six hours read. */
const MAX_ENGAGED_MS = 6 * 60 * 60 * 1000;

const sameHost = (url: URL) => url.hostname.toLowerCase() === window.location.hostname.toLowerCase();
const targetElement = (e: Event) => (e.target instanceof Element ? e.target : null);

/** Clicks on `[data-track]` by name, and links that leave the site by host only. */
export function trackClicks(t: Tracker): void {
  t.listen(
    document,
    "click",
    (e) => {
      const el = targetElement(e);
      if (!el) return;
      const name = el.closest<HTMLElement>("[data-track]")?.getAttribute("data-track")?.trim();
      if (name) {
        t.push({ t: "click", k: clip(name, 60) });
        t.flushSoon();
        return;
      }
      const link = el.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      try {
        const url = new URL(link.href, window.location.href);
        if (!/^https?:$/.test(url.protocol) || sameHost(url)) return;
        t.push({ t: "outbound", k: clip(url.hostname.toLowerCase(), 120) });
        t.flushSoon();
      } catch {
        /* unparsable href — not a navigation we can name */
      }
    },
    { capture: true },
  );
}

/** Scroll depth milestones, each once per page view. They ride along with the next batch. */
export function trackScroll(t: Tracker): void {
  let reached = new Set<number>();
  let frame = 0;

  const measure = () => {
    frame = 0;
    const doc = document.documentElement;
    const scrollable = Math.max(doc.scrollHeight - window.innerHeight, 0);
    // A page that fits the viewport was seen in full.
    const pct = scrollable <= 0 ? 100 : Math.round(((window.scrollY || 0) / scrollable) * 100);
    for (const m of SCROLL_MILESTONES) {
      if (pct >= m && !reached.has(m)) {
        reached.add(m);
        t.push({ t: "scroll", n: m });
      }
    }
  };
  const schedule = () => {
    if (frame) return;
    frame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(measure)
        : (setTimeout(measure, 0) as unknown as number);
  };

  t.listen(window, "scroll", schedule, { passive: true });
  t.onPageview(() => {
    reached = new Set();
    schedule();
  });
  t.onStop(() => {
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  });
}

/** Which `section[id]` were reached: its top passed the middle of the viewport. */
export function trackSections(t: Tracker): void {
  let reached = new Set<string>();
  let io: IntersectionObserver | null = null;

  t.onPageview(() => {
    reached = new Set();
    io?.disconnect();
    if (typeof IntersectionObserver !== "function") return;
    // "50 % visible" never happens for a section taller than the screen.
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).id;
          if (!id || reached.has(id)) continue;
          reached.add(id);
          t.push({ t: "section", k: clip(id, 60) });
        }
      },
      { rootMargin: "0px 0px -50% 0px", threshold: 0 },
    );
    document.querySelectorAll<HTMLElement>("section[id]").forEach((s) => io?.observe(s));
  });
  t.onStop(() => io?.disconnect());
}

const NON_FIELD_INPUTS = ["submit", "button", "hidden", "reset"];

/** The tracked form an element belongs to, by its `data-track-form` name. */
function formName(el: Element | null): string | null {
  const name = el?.closest<HTMLFormElement>("form[data-track-form]")?.getAttribute("data-track-form")?.trim();
  return name ? clip(name, 60) : null;
}

/**
 * The NAME of a form control the visitor entered — the attribute a developer
 * wrote. Never its value, never its label text (which can quote what the
 * visitor typed). `null` for anything that is not a field.
 */
function fieldName(el: Element): string | null {
  const isField =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  if (!isField) return null;
  if (el instanceof HTMLInputElement && NON_FIELD_INPUTS.includes(el.type)) return null;
  return clip(el.name || el.id || el.type || "field", 60);
}

/** Form progress on `form[data-track-form]`: started, each field entered, submitted. */
export function trackForms(t: Tracker): void {
  let started = new Set<string>();
  let lastField = new Map<string, string>();

  t.listen(
    document,
    "focusin",
    (e) => {
      const el = targetElement(e);
      const form = formName(el);
      const field = el && form ? fieldName(el) : null;
      if (!form || !field) return;
      if (!started.has(form)) {
        started.add(form);
        t.push({ t: "form_start", k: form });
      }
      if (lastField.get(form) !== field) {
        lastField.set(form, field);
        t.push({ t: "form_field", k: form, f: field });
      }
    },
    { capture: true },
  );
  t.listen(
    document,
    "submit",
    (e) => {
      const form = formName(targetElement(e));
      if (!form) return;
      t.push({ t: "form_submit", k: form });
      t.flushSoon();
    },
    { capture: true },
  );
  t.onPageview(() => {
    started = new Set();
    lastField = new Map();
  });
}

/**
 * Engaged time, sent whenever the page is hidden, plus the page views the
 * browser causes: the first one (deferred while the page is prerendered) and a
 * back/forward-cache restore, which runs no script.
 */
export function trackLifecycle(t: Tracker): void {
  let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  let engaged = 0;

  const onHidden = () => {
    if (visibleSince) {
      engaged += Date.now() - visibleSince;
      visibleSince = 0;
    }
    if (engaged > 0) {
      t.push({ t: "exit", n: Math.min(engaged, MAX_ENGAGED_MS) });
      engaged = 0;
    }
    t.flush();
  };

  t.listen(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") onHidden();
    else visibleSince = Date.now();
  });
  t.listen(window, "pagehide", onHidden);
  t.listen(window, "pageshow", (e) => {
    if (!(e as PageTransitionEvent).persisted) return;
    visibleSince = Date.now();
    engaged = 0;
    t.pageview();
  });

  // A page prerendered on a hunch (speculation rules) runs this script before
  // anyone looks at it. Count it when it is actually shown.
  if ((document as Document & { prerendering?: boolean }).prerendering) {
    t.listen(
      document,
      "prerenderingchange",
      () => {
        visibleSince = Date.now();
        t.pageview();
      },
      { once: true },
    );
  } else {
    t.pageview();
  }
}
