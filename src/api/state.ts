/** The api module's shared mutable state (see the note below). */
import type { RuntimeConfig } from "./runtime.js";

/** The meta tag the frontend host renders into `<head>`. */
export const API_BASE_META = "tds-api-base";

/** Used when nothing else resolves — the production gateway. */
export const DEFAULT_API_BASE = "https://api.tracht-digital.de";

export type UnauthorizedHandler = (url: string) => void | Promise<void>;
export type HeadersProvider = (url: string) => Record<string, string>;

/**
 * This module's mutable state, parked on `globalThis` rather than in module
 * scope.
 *
 * ### Why, and it is not a style choice
 *
 * `tsup` builds every entry point standalone (`splitting: false`, and the CJS
 * half cannot split at all), so a *sibling* entry that imports `../api`
 * gets its own **copy** of this file compiled into its bundle. Three entries do
 * — `./components` (LiveChatCta, AccountMenu) and `./data` — and with the state
 * in module scope each copy would have its own.
 *
 * Nothing about that fails loudly. What it costs:
 *
 *  - `onUnauthorized`: the frontend host registers the 401→`/me`-probe backstop
 *    once, on the `./api` copy. Every call made through another copy silently
 *    loses it and treats an expired session as a plain 401.
 *  - `headersProvider`: the same registration carries `X-Act-As-Company`. A
 *    call through another copy omits it, so an admin viewing another company's
 *    data quietly gets their own — a wrong answer, not an error.
 *  - `runtimePromise`: each copy re-probes `/tds-runtime.json` once.
 *
 * A `Symbol.for` key rather than a string property: it cannot collide with an
 * unrelated global, and it is invisible to `JSON.stringify` and `Object.keys`
 * on `globalThis`, which some environments enumerate.
 */
interface ApiState {
  /** Memoised {@link apiBase}. */
  cached: string | null;
  runtimePromise: Promise<RuntimeConfig | null> | null;
  runtimeValue: RuntimeConfig | null;
  onUnauthorized: UnauthorizedHandler | null;
  headersProvider: HeadersProvider | null;
}

const STATE_KEY = Symbol.for("@tracht-digital-labs/tds-shared:api-state");

type StateHost = typeof globalThis & { [STATE_KEY]?: ApiState };

export const state: ApiState = ((): ApiState => {
  const host = globalThis as StateHost;
  const existing = host[STATE_KEY];
  if (existing !== undefined) return existing;
  const fresh: ApiState = {
    cached: null,
    runtimePromise: null,
    runtimeValue: null,
    onUnauthorized: null,
    headersProvider: null,
  };
  host[STATE_KEY] = fresh;
  return fresh;
})();

export const trimEnd = (value: string): string => value.replace(/\/+$/, "");
