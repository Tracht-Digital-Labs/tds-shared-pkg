import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EventMap } from "./events.js";
import { pageCache, type PageCacheOptions } from "./middleware.js";
import { PageCacheStore } from "./store.js";

/**
 * The page cache's request half and its control plane, end to end against a
 * real directory. The host-key cases live in `cache.test.ts`.
 */

const TOKEN = "s3cret";
const ORIGIN = "https://site.test";
const HTML = { "content-type": "text/html; charset=utf-8" };

let dir: string;
let metaDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tds-pc-"));
  metaDir = await mkdtemp(join(tmpdir(), "tds-pc-meta-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(metaDir, { recursive: true, force: true });
});

const EVENTS: EventMap = { post: (e) => [`/blog/${e.id}`, "/blog"] };

const build = (over: Partial<PageCacheOptions> = {}) =>
  pageCache({ dir, metaDir, events: EVENTS, token: TOKEN, dailyRefresh: false, logger: () => {}, ...over });

/** One request through the middleware; `render` stands in for Astro. */
function visit(
  cache: ReturnType<typeof pageCache>,
  path: string,
  render: () => Response = () => new Response(`page ${path}`, { status: 200, headers: HTML }),
  init: RequestInit = {},
  extra: { isPrerendered?: boolean } = {},
) {
  const url = new URL(path, ORIGIN);
  const next = vi.fn(async () => render());
  const res = cache.middleware({ request: new Request(url, init), url, ...extra }, next);
  return { res, next };
}

function control(cache: ReturnType<typeof pageCache>, action: string, init: RequestInit = {}) {
  const url = new URL(`/tds/cache/${action}`, ORIGIN);
  const headers = new Headers(init.headers);
  if (!headers.has("x-tds-cache-token") && !headers.has("authorization")) headers.set("x-tds-cache-token", TOKEN);
  return cache.control(action, new Request(url, { ...init, headers }), url);
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("pageCache middleware", () => {
  it("renders a miss once, then serves the stored bytes with an etag", async () => {
    const cache = build();
    const miss = await visit(cache, "/preise").res;
    expect(miss.headers.get("x-tds-cache")).toBe("MISS");
    expect(miss.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    const etag = miss.headers.get("etag");
    expect(etag).toBeTruthy();

    const { res, next } = visit(cache, "/preise", () => new Response("never"));
    const hit = await res;
    expect(next).not.toHaveBeenCalled();
    expect(hit.headers.get("x-tds-cache")).toBe("HIT");
    expect(hit.headers.get("etag")).toBe(etag);
    expect(hit.headers.get("content-type")).toBe(HTML["content-type"]);
    expect(await hit.text()).toBe("page /preise");
  });

  it("answers a matching If-None-Match with 304 and no body", async () => {
    const cache = build();
    const etag = (await visit(cache, "/a").res).headers.get("etag")!;
    const res = await visit(cache, "/a", undefined, { headers: { "if-none-match": etag } }).res;
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("answers a HEAD hit without a body", async () => {
    const cache = build();
    await visit(cache, "/a").res;
    const res = await visit(cache, "/a", undefined, { method: "HEAD" }).res;
    expect(res.headers.get("x-tds-cache")).toBe("HIT");
    expect(await res.text()).toBe("");
  });

  it("re-renders over a hit only for the refresh header carrying the token", async () => {
    const cache = build();
    await visit(cache, "/a").res;
    const wrong = await visit(cache, "/a", () => new Response("v2", { headers: HTML }), {
      headers: { "x-tds-cache-refresh": "guess" },
    }).res;
    expect(wrong.headers.get("x-tds-cache")).toBe("HIT");

    const right = await visit(cache, "/a", () => new Response("v2", { headers: HTML }), {
      headers: { "x-tds-cache-refresh": TOKEN },
    }).res;
    expect(right.headers.get("x-tds-cache")).toBe("REFRESH");
    expect(await (await visit(cache, "/a").res).text()).toBe("v2");
  });

  it.each([
    ["sets a cookie", () => new Response("x", { headers: { ...HTML, "set-cookie": "a=b" } })],
    ["says no-store", () => new Response("x", { headers: { ...HTML, "cache-control": "private, no-store" } })],
    ["is not a 200", () => new Response("x", { status: 404, headers: HTML })],
    ["has an unstorable type", () => new Response("x", { headers: { "content-type": "image/jpeg" } })],
  ])("passes a response that %s through, marked BYPASS, status kept", async (_why, render) => {
    const cache = build();
    const res = await visit(cache, "/a", render).res;
    expect(res.headers.get("x-tds-cache")).toBe("BYPASS");
    expect(res.status).toBe(render().status);
    expect(await new PageCacheStore(dir, metaDir).list()).toEqual([]);
  });

  it("never stores a HEAD render", async () => {
    const res = await visit(build(), "/a", undefined, { method: "HEAD" }).res;
    expect(res.headers.get("x-tds-cache")).toBe("BYPASS");
  });

  it.each([
    ["a POST", build, { method: "POST", body: "x" }, {}],
    ["a prerendered route", build, {}, { isPrerendered: true }],
    ["a disabled cache", () => build({ enabled: false }), {}, {}],
  ])("hands %s to the site untouched", async (_what, make, init, extra) => {
    const rendered = new Response("x", { headers: HTML });
    const res = await visit(make(), "/a", () => rendered, init, extra).res;
    expect(res).toBe(rendered);
  });

  it("still serves the render when the cache directory is unwritable", async () => {
    const file = join(dir, "not-a-dir");
    await writeFile(file, "");
    const logger = vi.fn();
    const res = await visit(build({ dir: file, logger }), "/a").res;
    expect(res.status).toBe(200);
    expect(res.headers.get("x-tds-cache")).toBe("MISS");
    expect(res.headers.get("etag")).toBeNull();
    expect(await res.text()).toBe("page /a");
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("could not store /a"));
  });
});

describe("pageCache control plane", () => {
  it("refuses to run without a configured token", async () => {
    const res = await control(build({ token: "" }), "status");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "cache_token_not_configured" });
  });

  it("rejects a wrong token and accepts a bearer one", async () => {
    const cache = build();
    expect((await control(cache, "status", { headers: { "x-tds-cache-token": "nope" } })).status).toBe(401);
    expect((await control(cache, "status", { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
  });

  it("prefers the token provider and falls back to the static token when it throws", async () => {
    const provided = build({ tokenProvider: () => "paired" });
    expect((await control(provided, "status")).status).toBe(401);
    expect((await control(provided, "status", { headers: { "x-tds-cache-token": "paired" } })).status).toBe(200);

    const broken = build({
      tokenProvider: () => {
        throw new Error("store offline");
      },
    });
    expect((await control(broken, "status")).status).toBe(200);
  });

  it("reports what the store holds", async () => {
    const cache = build();
    await visit(cache, "/a").res;
    await visit(cache, "/b").res;
    const body = (await (await control(cache, "status")).json()) as Record<string, unknown>;
    expect(body.count).toBe(2);
    expect(body.bytes).toBe("page /a".length + "page /b".length);
    expect((body.entries as Array<{ path: string }>).map((e) => e.path).sort()).toEqual(["/a", "/b"]);
  });

  it.each([
    ["a GET to a write action", "purge", {}, 405, "method_not_allowed"],
    ["a body that is not JSON", "purge", { method: "POST", body: "{" }, 400, "invalid_json"],
    ["an unknown action", "explode", post({}), 404, "not_found"],
  ])("answers %s with its error", async (_what, action, init, status, error) => {
    const res = await control(build(), action, init);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("purges everything and drops the site's memos", async () => {
    const onInvalidate = vi.fn();
    const cache = build({ onInvalidate });
    await visit(cache, "/a").res;
    const res = await control(cache, "purge", post({ all: true }));
    expect(await res.json()).toEqual({ purged: "all" });
    expect(await new PageCacheStore(dir, metaDir).list()).toEqual([]);
    expect(onInvalidate).toHaveBeenCalledOnce();
  });

  it("purges the pages an event dates plus absolute explicit paths", async () => {
    const cache = build();
    for (const p of ["/blog/x", "/blog", "/kontakt", "/bleibt"]) await visit(cache, p).res;
    const res = await control(
      cache,
      "purge",
      post({ events: [{ type: "post", id: "x" }, { type: "mystery", id: "?" }], paths: ["/kontakt", "relative"] }),
    );
    const body = (await res.json()) as { purged: string[]; unknownEvents: string[] };
    expect(body.purged.sort()).toEqual(["/blog", "/blog/x", "/kontakt"]);
    expect(body.unknownEvents).toEqual(["mystery"]);
    const left = (await new PageCacheStore(dir, metaDir).list()).map((e) => e.path);
    expect(left).toEqual(["/bleibt"]);
  });

  it("answers 500 rather than throwing when the site's hook fails", async () => {
    const logger = vi.fn();
    const cache = build({
      logger,
      onInvalidate: () => {
        throw new Error("memo gone");
      },
    });
    const res = await control(cache, "purge", post({ all: true }));
    expect(res.status).toBe(500);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("memo gone"));
  });
});

describe("pageCache rebuild", () => {
  /** Route the rebuild's self-requests back into the middleware with `render`. */
  function serveSelf(cache: ReturnType<typeof pageCache>, render: (path: string) => Response) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/kaputt") throw new Error("ECONNRESET");
      return cache.middleware({ request: new Request(url, init), url }, async () => render(url.pathname));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-renders each path over its hit and sorts the outcome into rebuilt, skipped and failed", async () => {
    const order: string[] = [];
    const cache = build({ onInvalidate: () => order.push("invalidate") });
    await visit(cache, "/a").res;
    const fetchMock = serveSelf(cache, (path) => {
      order.push(`render ${path}`);
      if (path === "/weg") return new Response("x", { status: 404, headers: HTML });
      if (path === "/bild") return new Response("x", { headers: { "content-type": "image/jpeg" } });
      return new Response(`neu ${path}`, { headers: HTML });
    });

    const res = await control(cache, "rebuild", post({ paths: ["/a", "/bild", "/weg", "/kaputt"] }));
    const body = (await res.json()) as {
      rebuilt: string[];
      skipped: string[];
      failed: Array<{ path: string; status: number | string }>;
    };

    expect(body.rebuilt).toEqual(["/a"]);
    expect(body.skipped).toEqual(["/bild"]);
    expect(body.failed).toContainEqual({ path: "/weg", status: 404 });
    expect(body.failed).toContainEqual({ path: "/kaputt", status: expect.stringContaining("ECONNRESET") });
    expect(order[0]).toBe("invalidate");
    expect(await (await visit(cache, "/a").res).text()).toBe("neu /a");
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("x-tds-cache-refresh")).toBe(TOKEN);
    }
  });

  it("rebuilds everything cached plus the always-paths, in path order", async () => {
    const cache = build({ alwaysPaths: ["/neu", "/a"] });
    await visit(cache, "/z").res;
    await visit(cache, "/a").res;
    const fetchMock = serveSelf(cache, (path) => new Response(path, { headers: HTML }));
    const body = (await (await control(cache, "rebuild", post({ all: true }))).json()) as { rebuilt: string[] };
    expect(body.rebuilt).toEqual(["/a", "/neu", "/z"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("requests each key through rebuildUrl when the site keys by host", async () => {
    const cache = build({ rebuildUrl: (key, origin) => `${origin}/via${key}` });
    const fetchMock = serveSelf(cache, (path) => new Response(path, { headers: HTML }));
    await control(cache, "rebuild", post({ paths: ["/x"] }));
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${ORIGIN}/via/x`);
  });

  it("never renders more pages at once than the concurrency allows", async () => {
    let inFlight = 0;
    let peak = 0;
    const cache = build({ concurrency: 2 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return new Response("x", { headers: HTML });
      }),
    );
    await control(cache, "rebuild", post({ paths: ["/1", "/2", "/3", "/4", "/5"] }));
    expect(peak).toBe(2);
  });
});
