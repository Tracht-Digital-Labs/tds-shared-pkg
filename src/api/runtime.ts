/**
 * `tds-runtime.json`: the host-side configuration the setup wizard publishes,
 * fetched once and memoised. Re-exported from `./api`.
 */
import { API_BASE_META, state, trimEnd } from "./state.js";

/**
 * Where {@link runtimeConfig} looks. Written by `install/index.php` into the
 * deployed docroot, so it is always same-origin and always a plain static file.
 */
export const RUNTIME_CONFIG_PATH = "/tds-runtime.json";

/**
 * Every key a site profile may put in `tds-runtime.json`.
 *
 * The PHP profiles in `install/profiles/*.php` list a subset per site under
 * `runtime_keys`, and `src/__tests__/installer.test.ts` asserts the two sides
 * agree. That test is the only thing standing between "the installer writes
 * `contactURL`" and a contact form that silently keeps using the baked URL —
 * a typo here has no other symptom.
 */
export const RUNTIME_KEYS = [
  "apiBase",
  "authBase",
  "loginUrl",
  "contactUrl",
  "liveChatFrontend",
] as const;

export type RuntimeKey = (typeof RUNTIME_KEYS)[number];

/**
 * What the host-side setup wizard published for this site.
 *
 * Present only on a deployed host whose operator ran `/install`;
 * everywhere else (dev, CI, a site nobody has configured) it is simply absent
 * and every consumer keeps its build-time value.
 */
export type RuntimeConfig = {
  version: number;
  site: string;
  mode: "proxy" | "direct";
  generatedAt?: string;
} & Partial<Record<RuntimeKey, string>>;

/**
 * The host-side runtime configuration, fetched once and memoised.
 *
 * ### Why this exists
 *
 * The public sites (`tracht-digital.de`, `blog.`, `tools.`) are static Astro
 * builds: Vite inlines every `PUBLIC_*` at build time, so a deployed `dist/`
 * cannot be re-pointed at a different API without a full CI rebuild. That makes
 * an operator on the host powerless over the one thing they most need to fix —
 * and it fails silently, because every content fetch is deliberately fail-soft.
 * `install/index.php` writes `tds-runtime.json` beside `index.html`; this
 * function is what makes the deployed site read it.
 *
 * ### Contract
 *
 * **A missing or broken file is not an error.** 404, invalid JSON, offline, no
 * `fetch` at all — every one of them resolves to `null`, and the caller keeps
 * the value its build baked in. A site nobody has run the installer on behaves
 * exactly as it did before this function existed; that is the property that
 * lets it ship without touching any deployment.
 *
 * Returns `null` during SSR / `astro build` without attempting a request: there
 * is no origin to resolve a relative URL against, and the build-time content
 * fetches are configured through the environment, not through the host.
 *
 * It also returns `null` without a request when the page carries a
 * {@link API_BASE_META} tag. That tag is written by the frontend host's shell,
 * so its presence means "this page is a product build that already knows its
 * API" — the admin panel and the customer portal. Without this check every
 * panel page would fire a guaranteed 404 for a file only the public sites ever
 * have, on every single navigation.
 */
export async function runtimeConfig(): Promise<RuntimeConfig | null> {
  if (state.runtimePromise !== null) return state.runtimePromise;

  if (typeof document === "undefined" || typeof fetch !== "function") {
    state.runtimePromise = Promise.resolve(null);
    return state.runtimePromise;
  }

  let declared = "";
  try {
    declared = document.querySelector(`meta[name="${API_BASE_META}"]`)?.getAttribute("content") ?? "";
  } catch {
    /* exotic document — treat as "not declared" and go look for the file */
  }
  if (declared.trim() !== "") {
    state.runtimePromise = Promise.resolve(null);
    return state.runtimePromise;
  }

  state.runtimePromise = (async () => {
    try {
      const res = await fetch(RUNTIME_CONFIG_PATH, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        // A hung request must not become a hung page. Everything downstream
        // waits on this promise — `apiFetch` awaits it before resolving a URL,
        // and the tools access gate awaits it before probing the session — so
        // without a deadline one stalled request for a static file leaves the
        // gate spinning forever. Timing out means "no config", which is the
        // same safe answer as a 404.
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(3000) : undefined,
      });
      // The static host answers unknown paths with its SPA fallback — HTTP 200
      // plus index.html — so `res.ok` alone proves nothing. The content-type
      // check is what tells a real config from the site's own homepage.
      if (!res.ok) return null;
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("json")) return null;

      const parsed: unknown = await res.json();
      if (parsed === null || typeof parsed !== "object") return null;

      const config = parsed as RuntimeConfig;
      if (typeof config.apiBase === "string" && config.apiBase !== "") {
        // Seed the memoised base so plain `apiUrl()` callers follow too.
        state.cached = trimEnd(config.apiBase);
      }
      state.runtimeValue = config;
      return config;
    } catch {
      /* offline, blocked, malformed — the baked build value stands */
      return null;
    }
  })();

  return state.runtimePromise;
}

/**
 * What {@link runtimeConfig} has already resolved, without waiting.
 *
 * For synchronous render paths that must not suspend. `null` means "not loaded
 * yet OR not present" — those two are deliberately indistinguishable here,
 * because the correct response to both is the same: use the build-time value.
 */
export function runtimeConfigSync(): RuntimeConfig | null {
  return state.runtimeValue;
}

/**
 * One configured value, or the build-time fallback.
 *
 * The shape every call site on the public sites wants:
 *
 * ```ts
 * const url = await runtimeSetting("contactUrl", CONTACT_API_URL);
 * ```
 */
export async function runtimeSetting(key: RuntimeKey, fallback: string): Promise<string> {
  const config = await runtimeConfig();
  const value = config?.[key];
  return typeof value === "string" && value !== "" ? value : fallback;
}

/**
 * One configured value, but only when it is an ABSOLUTE origin.
 *
 * For anything whose response must set or clear a cookie.
 * `install/proxy.php` deliberately drops `Set-Cookie` ("these sites read, they
 * never log in"), and proxy mode publishes a RELATIVE base (`/api`,
 * `/api/auth`). Honouring a relative value for a login or a logout therefore
 * yields a request that answers **200 and changes nothing** — success reported,
 * no session started or ended, and nothing in any log.
 *
 * A relative value is not an error here, it is simply not usable for this
 * purpose: the caller falls back to its absolute build-time default. Keeping
 * the rule in one exported function is what stops it being re-derived — and
 * forgotten — at the next call site.
 *
 * ```ts
 * const base = await runtimeAbsolute("authBase", AUTH_API_URL);
 * ```
 */
export async function runtimeAbsolute(key: RuntimeKey, fallback: string): Promise<string> {
  const value = await runtimeSetting(key, "");
  return trimEnd(/^https?:\/\//i.test(value) ? value : fallback);
}

/** Test seam — production code never calls this. {@see resetApiBase}. */
export function resetRuntimeConfig(): void {
  state.runtimePromise = null;
  state.runtimeValue = null;
}

/**
 * Supply the runtime config directly, skipping the request.
 *
 * Two uses. In tests it keeps {@link apiFetch} down to exactly the one call the
 * assertion is about — without it every suite that inspects `mock.calls[0]`
 * would be reading the `/tds-runtime.json` probe instead of its own request.
 * And it is the seam for a host that wants to inject the config some other way
 * (an inline `<script>`, a different filename) without this module growing a
 * second discovery path.
 */
export function primeRuntimeConfig(config: RuntimeConfig | null): void {
  state.runtimeValue = config;
  state.runtimePromise = Promise.resolve(config);
  if (config !== null && typeof config.apiBase === "string" && config.apiBase !== "") {
    state.cached = trimEnd(config.apiBase);
  }
}

