/**
 * The two analytics ids and their storage. Neither exists before consent;
 * both are deleted the moment it is withdrawn.
 */

export const VISITOR_KEY = "tds-vid";
export const SESSION_KEY = "tds-sid";
export const VISITOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;

interface StoredVisitor {
  id: string;
  exp: number;
}

export interface StoredSession {
  id: string;
  last: number;
  /** Referrer/UTM already sent for this session. */
  sent: boolean;
  ret: boolean;
}

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* insecure context — fall through */
  }
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function readJson<T>(store: Storage | undefined, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: Storage | undefined, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — this page view is measured, nothing is remembered */
  }
}

/** A storage area, or `undefined` where the browser refuses access. */
function storage(area: "localStorage" | "sessionStorage"): Storage | undefined {
  try {
    return window[area];
  } catch {
    return undefined;
  }
}

/** The current visitor id, or `null` when there is none (no consent, expired, forgotten). */
export function analyticsVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  const v = readJson<StoredVisitor>(storage("localStorage"), VISITOR_KEY);
  if (!v || typeof v.id !== "string" || typeof v.exp !== "number" || v.exp < Date.now()) return null;
  return v.id;
}

/** Delete both ids from this browser. Withdrawal and "forget me" both end here. */
export function clearAnalyticsIds(): void {
  try {
    storage("localStorage")?.removeItem(VISITOR_KEY);
  } catch {
    /* ignore */
  }
  try {
    storage("sessionStorage")?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Visitor id with a FIXED expiry: 30 days from creation, not sliding. A
 * sliding window would let an id live for as long as someone keeps visiting,
 * which is not what the consent text says.
 */
export function ensureVisitor(now: number): { id: string; existed: boolean } {
  const existing = analyticsVisitorId();
  if (existing) return { id: existing, existed: true };
  const id = uuid();
  writeJson(storage("localStorage"), VISITOR_KEY, { id, exp: now + VISITOR_TTL_MS } satisfies StoredVisitor);
  return { id, existed: false };
}

/** The running session, extended to `now`, or a fresh one after 30 idle minutes. */
export function ensureSession(now: number, visitorExisted: boolean): StoredSession {
  const s = readJson<StoredSession>(storage("sessionStorage"), SESSION_KEY);
  if (s && typeof s.id === "string" && typeof s.last === "number" && now - s.last < SESSION_IDLE_MS) {
    s.last = now;
    saveSession(s);
    return s;
  }
  const fresh: StoredSession = { id: uuid(), last: now, sent: false, ret: visitorExisted };
  saveSession(fresh);
  return fresh;
}

export function saveSession(s: StoredSession): void {
  writeJson(storage("sessionStorage"), SESSION_KEY, s);
}
