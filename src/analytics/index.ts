/**
 * The public sites' own audience measurement — consent-gated, first-party,
 * no third party anywhere in the chain.
 *
 * What it records, once the visitor has agreed to the `analytics` category:
 *
 *  - page views (path only — never the query string or the hash, which is
 *    where e-mail addresses and reset tokens end up),
 *  - clicks on elements that carry `data-track="name"` and on links that
 *    leave the site (the target host only),
 *  - scroll depth (25/50/75/100 %) and which `section[id]` were reached,
 *  - form progress on `form[data-track-form="name"]`: started, the NAME of
 *    each field entered, submitted. Never a value. Where a visitor gave up
 *    is derived on the server from the last field they entered.
 *  - engaged time, sent whenever the page is hidden.
 *
 * Identity is a random visitor id in localStorage that expires after 30 days
 * and a session id in sessionStorage that ends after 30 idle minutes. Neither
 * exists before consent, and both are deleted the moment consent is
 * withdrawn. The server derives country, device class and browser family
 * from the request and stores neither the IP address nor the user agent.
 *
 * No side effects on import (`sideEffects: ["*.css"]`): a site calls
 * {@link startAnalytics} from its layout.
 */
import { apiBase, runtimeSetting } from "../api/index";
import { consentGranted, onConsentChange } from "../consent/store";
import {
  clip,
  trackClicks,
  trackForms,
  trackLifecycle,
  trackScroll,
  trackSections,
  type Tracker,
} from "./collectors";
import { analyticsVisitorId, clearAnalyticsIds, ensureSession, ensureVisitor, saveSession } from "./identity";
import type { AnalyticsBatch, AnalyticsEvent, AnalyticsOptions } from "./types";

export type { AnalyticsBatch, AnalyticsEvent, AnalyticsOptions, AnalyticsSite } from "./types";
export {
  SESSION_IDLE_MS,
  SESSION_KEY,
  VISITOR_KEY,
  VISITOR_TTL_MS,
  analyticsVisitorId,
  clearAnalyticsIds,
} from "./identity";

const MAX_QUEUE = 40;
const FLUSH_DELAY_MS = 1000;

/* ------------------------------------------------------------------ */
/* Request context                                                     */
/* ------------------------------------------------------------------ */

function currentPath(): string {
  return clip(window.location.pathname || "/", 200);
}

function referrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname.toLowerCase();
    return host && host !== window.location.hostname.toLowerCase() ? clip(host, 120) : undefined;
  } catch {
    return undefined;
  }
}

function utm(): AnalyticsBatch["utm"] {
  try {
    const q = new URLSearchParams(window.location.search);
    const out: NonNullable<AnalyticsBatch["utm"]> = {};
    for (const key of ["source", "medium", "campaign"] as const) {
      const value = q.get(`utm_${key}`);
      if (value) out[key] = clip(value.toLowerCase(), 100);
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** The browser-level "do not sell or share" signal. Honoured even after consent. */
function globalPrivacyControl(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

async function resolveEndpoint(override?: string): Promise<string> {
  if (override) return override.replace(/\/+$/, "");
  const base = await runtimeSetting("apiBase", apiBase());
  return `${base.replace(/\/+$/, "")}/analytics`;
}

/**
 * Fire and forget. `text/plain` on purpose: it is a CORS-safelisted type, so a
 * cross-origin beacon needs no preflight — and a preflight cannot be answered
 * while the page is unloading.
 */
function send(url: string, body: string): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(url, body)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch(url, {
      method: "POST",
      body,
      keepalive: true,
      mode: "no-cors",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    }).catch(() => {});
  } catch {
    /* nothing left to try — measurement never breaks a page */
  }
}

/* ------------------------------------------------------------------ */
/* The tracker                                                         */
/* ------------------------------------------------------------------ */

/**
 * Start measuring on this page. Does nothing until the visitor has agreed to
 * `analytics`, starts the moment they do, and stops — deleting both ids — the
 * moment they withdraw. Returns a stop function (tests, hot reload).
 */
export function startAnalytics(options: AnalyticsOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let armed: (() => void) | null = null;

  const evaluate = () => {
    const allowed = consentGranted("analytics") && !globalPrivacyControl();
    if (allowed && !armed) armed = arm(options);
    if (!allowed && armed) {
      armed();
      armed = null;
      clearAnalyticsIds();
    }
  };

  evaluate();
  const offConsent = onConsentChange(evaluate);

  return () => {
    offConsent();
    armed?.();
    armed = null;
  };
}

/** Install every collector on a fresh tracker. Returns its stop function. */
function arm(options: AnalyticsOptions): () => void {
  const { tracker, stop } = createTracker(options);
  trackClicks(tracker);
  trackSections(tracker);
  trackScroll(tracker);
  trackForms(tracker);
  trackLifecycle(tracker);
  return stop;
}

/** The queue, its batching, and the listener and hook registry the collectors share. */
function createTracker(options: AnalyticsOptions): { tracker: Tracker; stop: () => void } {
  const endpointPromise = resolveEndpoint(options.endpoint);
  const queue: AnalyticsEvent[] = [];
  const pageviewHooks: Array<() => void> = [];
  const stopHooks: Array<() => void> = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (queue.length === 0) return;
    const body = JSON.stringify(batchOf(queue.splice(0, queue.length), options));
    void endpointPromise.then((base) => send(`${base}/collect`, body));
  };

  const tracker: Tracker = {
    push(event) {
      queue.push({ p: currentPath(), ...event });
      if (queue.length >= MAX_QUEUE) flush();
    },
    flushSoon() {
      flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
    },
    flush,
    pageview() {
      tracker.push({ t: "pageview" });
      tracker.flushSoon();
      for (const hook of pageviewHooks) hook();
    },
    listen(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      stopHooks.push(() => target.removeEventListener(type, fn, opts));
    },
    onPageview: (fn) => void pageviewHooks.push(fn),
    onStop: (fn) => void stopHooks.push(fn),
  };

  const stop = () => {
    if (flushTimer) clearTimeout(flushTimer);
    queue.length = 0;
    for (const hook of stopHooks.splice(0)) hook();
  };
  return { tracker, stop };
}

/** Wrap events in the session envelope; referrer and UTM go on a session's first batch only. */
function batchOf(events: AnalyticsEvent[], options: AnalyticsOptions): AnalyticsBatch {
  const now = Date.now();
  const visitor = ensureVisitor(now);
  const sess = ensureSession(now, visitor.existed);
  const batch: AnalyticsBatch = {
    v: 1,
    site: options.site,
    lang: clip(options.lang || "de", 5),
    vid: visitor.id,
    sid: sess.id,
    ret: sess.ret,
    events,
  };
  if (!sess.sent) {
    const ref = referrerHost();
    const u = utm();
    if (ref) batch.ref = ref;
    if (u) batch.utm = u;
    sess.sent = true;
    saveSession(sess);
  }
  return batch;
}

/**
 * "Meine Statistikdaten löschen": ask the server to erase everything recorded
 * under this browser's visitor id, then delete the ids locally. Resolves to
 * `true` when there was nothing to erase or the server confirmed it.
 *
 * Erasing is not withdrawing: while `analytics` stays granted, the next page
 * view starts a new id. The privacy page pairs this with a withdrawal.
 */
export async function forgetAnalytics(endpoint?: string): Promise<boolean> {
  const vid = analyticsVisitorId();
  if (!vid) {
    clearAnalyticsIds();
    return true;
  }
  try {
    const base = await resolveEndpoint(endpoint);
    const res = await fetch(`${base}/forget`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ visitorId: vid }),
    });
    // Keep the id on failure: it is the only handle a retry has.
    if (res.ok) clearAnalyticsIds();
    return res.ok;
  } catch {
    return false;
  }
}
