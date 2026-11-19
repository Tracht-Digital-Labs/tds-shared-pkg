/**
 * The panel API transport — where a frontend call to the composed backend
 * actually goes.
 *
 * Consumed via
 * `import { apiFetch } from "@tracht-digital-labs/tds-shared/api"`.
 *
 * ### Why this module exists
 *
 * The frontend products are static sites on their own hosts
 * (`management.tracht-digital.de`, `app.tracht-digital.de`); the composed API
 * is a different origin (`api.tracht-digital.de`). Every `tds-ext-*` island
 * used to define its own one-liner
 *
 * ```ts
 * const api = (path, init) => fetch(path, { credentials: "include", ...init });
 * ```
 *
 * with a RELATIVE path, so every extension call resolved against the product's
 * own host. That failed in the worst possible way: the static host answers
 * unknown paths with `try_files … /index.html`, i.e. **HTTP 200 + HTML**, so
 * `res.ok` was `true`, `res.json()` threw, and the usual
 * `.catch(() => setRows([]))` rendered a calm, permanent empty state. No error,
 * no console warning — the contact inbox showed "Keine Anfragen." while the
 * rows sat in the database. One helper, imported everywhere, is what keeps that
 * from being re-typed per island.
 *
 * ### Where the base comes from
 *
 * A `<meta name="tds-api-base">` written by the frontend host shell, so the
 * value is decided by the PRODUCT build (which knows its own environment) and
 * read at runtime by packages that were built long before it. `import.meta.env`
 * is not a substitute: these modules are compiled into `node_modules` packages,
 * and a consumer's `PUBLIC_*` substitution is not something a published package
 * may rely on.
 */

import {
  API_BASE_META,
  DEFAULT_API_BASE,
  state,
  trimEnd,
  type HeadersProvider,
  type UnauthorizedHandler,
} from "./state.js";
import { runtimeConfig } from "./runtime.js";

export { API_BASE_META, DEFAULT_API_BASE } from "./state.js";

export {
  RUNTIME_CONFIG_PATH,
  RUNTIME_KEYS,
  type RuntimeKey,
  type RuntimeConfig,
  runtimeConfig,
  runtimeConfigSync,
  runtimeSetting,
  runtimeAbsolute,
  resetRuntimeConfig,
  primeRuntimeConfig,
} from "./runtime.js";



/**
 * The absolute origin (plus optional path prefix) every panel API call is made
 * against. Resolution order:
 *
 * 1. `<meta name="tds-api-base" content="…">` — written by the host shell.
 * 2. `import.meta.env.PUBLIC_API_BASE` — for apps that compile this from source.
 * 3. {@link DEFAULT_API_BASE}.
 *
 * Memoised only once a real document has been consulted: during SSR/`astro
 * build` there is no `<head>` to read, and caching the fallback there would
 * poison the first client call in a shared module graph.
 */
export function apiBase(): string {
  if (state.cached !== null) return state.cached;

  const env =
    typeof import.meta !== "undefined"
      ? ((import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_API_BASE ?? "")
      : "";

  if (typeof document === "undefined") {
    // SSR / build time — resolve, but do NOT memoise.
    return trimEnd(env || DEFAULT_API_BASE);
  }

  let meta = "";
  try {
    meta = document.querySelector(`meta[name="${API_BASE_META}"]`)?.getAttribute("content") ?? "";
  } catch {
    /* exotic document (jsdom teardown, sandboxed frame) — fall through */
  }

  state.cached = trimEnd(meta.trim() || env || DEFAULT_API_BASE);
  return state.cached;
}

/**
 * Test seam. Production code never calls this; `api.test.ts` and any island
 * test that swaps the document out do, because {@link apiBase} memoises.
 */
export function resetApiBase(): void {
  state.cached = null;
}

/**
 * Absolutise a panel API path.
 *
 * Anything already absolute (`http://`, `https://`, `//host`) is returned
 * untouched, which makes the call site idempotent — that is what lets an
 * extension migrate by wrapping its existing path expressions without auditing
 * whether any of them were already full URLs.
 */
export function apiUrl(path: string): string {
  if (/^(https?:)?\/\//i.test(path)) return path;
  return `${apiBase()}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Register what happens on a 401 from {@link apiFetch}.
 *
 * The frontend host registers its `onUnauthorized` here at shell start-up, so
 * an extension call finally gets the same backstop the host's own calls always
 * had: a 401 is confirmed against `/me` and a `POST /refresh` is tried before
 * the session is treated as dead. Unregistered (public sites, tests) a 401 is
 * simply returned to the caller.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  state.onUnauthorized = handler;
}

/**
 * Register headers to add to every {@link apiFetch}.
 *
 * The twin of {@link setUnauthorizedHandler}, and registered from the same
 * place: the frontend host's shell. Its first consumer is the company
 * switcher, which has to put `X-Act-As-Company` on every extension call — and
 * an extension cannot reach into the host to do that itself.
 *
 * **Generic headers, not `setActiveCompany(id)`**, deliberately. This is a
 * design/i18n/transport library; it must not learn what a company is. It also
 * solves the next "every call needs header X" the same way.
 *
 * The provider receives the resolved absolute URL, because *which* headers are
 * safe depends on where the call is going — see the note in `apiFetch`.
 * A provider must not throw; one that does is ignored for that request.
 */
export function setRequestHeadersProvider(provider: HeadersProvider | null): void {
  state.headersProvider = provider;
}

/**
 * `fetch` for the composed panel API.
 *
 * Sends the shared session cookie, resolves the path against {@link apiBase},
 * and returns the ORIGINAL response for every HTTP status — it never throws on
 * a status and never redirects on its own, so a caller can still handle a
 * legitimate 401/403 (RBAC) itself. Same contract as the host's
 * `frontendFetch`, deliberately: one mental model for base pages and extension
 * islands alike.
 *
 * **A request that never reaches the API still rejects** with the `TypeError`
 * fetch raises (offline, DNS, CORS, a gateway that is down). Catch it at the
 * call site: uncaught, a load stays on its spinner and a save ends in an
 * unhandled rejection the user never sees.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // Resolve the host-side config FIRST, so a site the operator re-pointed with
  // /install is followed by every existing call site without one of
  // them being edited. It is a single memoised request; every call after the
  // first awaits an already-settled promise.
  await runtimeConfig();

  const url = apiUrl(path);

  // Provider headers sit UNDER the caller's, so an explicit header at the call
  // site always wins. The provider decides per URL what is safe to send: the
  // auth API's CORS allow-list is narrower than the composed API's, and a
  // header it does not allow fails the PREFLIGHT — which means the request is
  // never sent at all and the button just looks dead.
  let extra: Record<string, string> = {};
  if (state.headersProvider !== null) {
    try {
      extra = state.headersProvider(url);
    } catch {
      /* a header provider must never be able to break the request */
    }
  }

  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...extra, ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401 && state.onUnauthorized !== null) {
    try {
      await state.onUnauthorized(url);
    } catch {
      /* the backstop must not turn a 401 into a thrown request */
    }
  }
  return res;
}

/**
 * `apiFetch` with a JSON body: sets `Content-Type` and stringifies `body`.
 * Same contract as `apiFetch` — every status resolves, a network failure
 * rejects. Replaces ~80 hand-written `"Content-Type": "application/json"`
 * headers across the panel islands (0.58).
 */
export function sendJson(path: string, method: string, body?: unknown, init: RequestInit = {}): Promise<Response> {
  return apiFetch(path, {
    ...init,
    method,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** The API's `{ error }` (or `{ message }`) text from a failed response, or `null`. */
export async function errorMessageOf(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: unknown; message?: unknown };
    const text = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : null;
    return text && text.trim() !== "" ? text : null;
  } catch {
    return null;
  }
}

/** Panel copy for the failures every island reports the same way. */
export const FAILURE_TEXT = {
  unreachable: "die API ist nicht erreichbar",
  adminOnly: "Nur für Administratoren.",
} as const;

/**
 * One German sentence for a failed request, in the panel's established wording:
 *
 * - `null` (the request never reached the API) → `"<action>, die API ist nicht erreichbar."`
 * - 401/403 with `adminOnly` → `"Nur für Administratoren."`
 * - otherwise → `"<action> (HTTP 500)."`
 *
 * `action` is the failed step, e.g. `"Speichern fehlgeschlagen"`; it defaults
 * to `"Fehler"`. For the API's own `{error}` text use `describeFailureFrom`.
 */
export function describeFailure(res: Response | null, action = "Fehler", opts: { adminOnly?: boolean } = {}): string {
  if (res === null) return `${action}, ${FAILURE_TEXT.unreachable}.`;
  if (opts.adminOnly && (res.status === 401 || res.status === 403)) return FAILURE_TEXT.adminOnly;
  return `${action} (HTTP ${res.status}).`;
}

/** `describeFailure`, but prefers the API's own `{error}` text: `"<error> (HTTP 422)"`. */
export async function describeFailureFrom(res: Response | null, action = "Fehler", opts: { adminOnly?: boolean } = {}): Promise<string> {
  if (res !== null && !(opts.adminOnly && (res.status === 401 || res.status === 403))) {
    const text = await errorMessageOf(res);
    if (text) return `${text} (HTTP ${res.status})`;
  }
  return describeFailure(res, action, opts);
}
