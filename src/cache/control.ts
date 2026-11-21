/**
 * The control plane: `status`, `purge` and `rebuild`, behind the cache token.
 * Mounted by a site on a real route (see `middleware.ts` for why it can't be
 * middleware).
 */

import { jsonResponse as json } from "../http/json.js";
import { resolveEvents, type CacheEvent, type EventMap } from "./events.js";
import { REFRESH_HEADER, STATUS_HEADER } from "./protocol.js";
import { tokenMatches, type PageCacheStore } from "./store.js";

export interface ControlOptions {
  store: PageCacheStore;
  events: EventMap;
  /** The token in force right now; empty means "not configured". */
  currentToken: () => string;
  onInvalidate?: () => void;
  alwaysPaths: string[];
  rebuildUrl?: (key: string, origin: string) => string;
  concurrency: number;
}

interface Payload {
  events?: CacheEvent[];
  paths?: string[];
  all?: boolean;
}

/** How many entries `status` lists; the count and byte total still cover all. */
const STATUS_LIST_LIMIT = 500;

type RenderOutcome = "rebuilt" | "skipped" | { status: number | string };

export function createControl(options: ControlOptions) {
  const { store, events, onInvalidate, alwaysPaths, rebuildUrl, concurrency } = options;

  /** The active token when the request carries it, else the response refusing it. */
  function authorize(request: Request): string | Response {
    const token = options.currentToken();
    if (!token) return json({ error: "cache_token_not_configured" }, 503);
    const given =
      request.headers.get("x-tds-cache-token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      null;
    return tokenMatches(token, given) ? token : json({ error: "unauthorized" }, 401);
  }

  async function status(): Promise<Response> {
    const entries = await store.list();
    return json({
      directory: store.directory,
      count: entries.length,
      newest: entries[0]?.renderedAt ?? null,
      oldest: entries[entries.length - 1]?.renderedAt ?? null,
      bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
      entries: entries.slice(0, STATUS_LIST_LIMIT),
    });
  }

  async function purge(payload: Payload, requested: string[], unknownEvents: string[]): Promise<Response> {
    if (payload.all) {
      await store.clear();
      onInvalidate?.();
      return json({ purged: "all" });
    }
    await Promise.all(requested.map((p) => store.remove(p)));
    onInvalidate?.();
    return json({ purged: requested, unknownEvents });
  }

  /** Request one page again with the refresh header and classify what came back. */
  async function render(path: string, origin: string, token: string): Promise<RenderOutcome> {
    const target = rebuildUrl ? rebuildUrl(path, origin) : new URL(path, origin).toString();
    const res = await fetch(target, { headers: { [REFRESH_HEADER]: token } });
    // Drain the body so the connection is released; the middleware already stored it.
    await res.arrayBuffer();
    if (!res.ok) return { status: res.status };
    // Rendered fine, stored nothing (unstorable type, or marked `no-store`).
    // Calling that "rebuilt" is how a path stays uncached behind a green result.
    return res.headers.get(STATUS_HEADER) === "BYPASS" ? "skipped" : "rebuilt";
  }

  async function rebuild(payload: Payload, requested: string[], unknownEvents: string[], url: URL, token: string) {
    const paths = payload.all
      ? [...new Set([...(await store.list()).map((e) => e.path), ...alwaysPaths])].sort()
      : requested;

    // Read through on every render this rebuild performs, or it faithfully
    // re-renders the content the process read at boot.
    onInvalidate?.();

    const rebuilt: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ path: string; status: number | string }> = [];
    await forEachConcurrently(paths, concurrency, async (path) => {
      try {
        const outcome = await render(path, url.origin, token);
        if (outcome === "rebuilt") rebuilt.push(path);
        else if (outcome === "skipped") skipped.push(path);
        else failed.push({ path, status: outcome.status });
      } catch (err) {
        failed.push({ path, status: String(err) });
      }
    });

    return json({ rebuilt: rebuilt.sort(), skipped: skipped.sort(), failed, unknownEvents });
  }

  return async function control(action: string, request: Request, url: URL): Promise<Response> {
    const token = authorize(request);
    if (token instanceof Response) return token;

    if (action === "status" && request.method === "GET") return status();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let payload: Payload;
    try {
      payload = (await request.json()) as Payload;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const resolved = await resolveEvents(events, payload.events ?? []);
    const explicit = (payload.paths ?? []).filter((p) => typeof p === "string" && p.startsWith("/"));
    const requested = [...new Set([...resolved.paths, ...explicit])];

    if (action === "purge") return purge(payload, requested, resolved.unknown);
    if (action === "rebuild") return rebuild(payload, requested, resolved.unknown, url, token);
    return json({ error: "not_found" }, 404);
  };
}

/** Run `task` over `items` with at most `limit` in flight. */
async function forEachConcurrently<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
}
