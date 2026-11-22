/**
 * `scripts/geo-audit.mjs`, run as the `tds-geo-audit` bin against a small
 * site served from this process. One site passes everything; the other breaks
 * one rule per page so the report names each failure the audit can raise.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const script = join(__dirname, "..", "..", "scripts", "geo-audit.mjs");
const SITE = "https://example.test";

const PROFILE = `export default {
  defaultBase: "http://127.0.0.1:1",
  site: "${SITE}",
  skipPaths: ["/api/"],
  agents: ["*", "GPTBot"],
  requiredDisallow: ["/api/"],
  sitemapIndexPath: "/sitemap-index.xml",
  titleMax: 60,
  descriptionRange: [20, 160],
  langs: ["de", "en"],
  bannedWords: /\\bnahtlos\\b/i,
  forbiddenProps: ["aggregateRating"],
  forbiddenTypes: ["Product"],
  entityAnchors: ["${SITE}/#org"],
  minWords: 5,
  llmsBudgetBytes: 400,
  extraCheckIds: ["site.extra"],
  pageKind: (path) =>
    path.startsWith("/guide/")
      ? { kind: "guide", requiredTypes: [["Article", "TechArticle"]], requireDate: true, detailChecks: true }
      : { kind: "page", requiredTypes: ["WebPage"], requireDate: false, minWords: path === "/kontakt/" ? 1 : undefined },
};
`;

interface PageSpec {
  path: string;
  title?: string;
  description?: string;
  lang?: string | null;
  robots?: string;
  canonical?: string | null;
  alternates?: Record<string, string>;
  ogImage?: string | null;
  jsonld?: string[];
  body?: string;
}

const words = "Ein Absatz mit genug Wörtern für jede Untergrenze hier.";

function page(spec: PageSpec): string {
  const {
    path,
    title = `Seite ${path}`,
    description = `Beschreibung der Seite ${path} mit genug Zeichen.`,
    lang = "de",
    robots,
    canonical = `${SITE}${path}`,
    alternates = { de: `${SITE}${path}`, en: `${SITE}${path}`, "x-default": `${SITE}${path}` },
    ogImage = `${SITE}/og.png`,
    jsonld = [JSON.stringify({ "@type": "WebPage", "@id": `${SITE}${path}#page` })],
    body = `<h1>Titel</h1><p>${words}</p>`,
  } = spec;
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    robots ? `<meta name="robots" content="${robots}">` : "",
    canonical ? `<link rel="canonical" href="${canonical}">` : "",
    ...Object.entries(alternates).map(([l, href]) => `<link rel="alternate" hreflang="${l}" href="${href}">`),
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    ogImage ? `<meta property="og:image" content="${ogImage}">` : "",
    ...jsonld.map((j) => `<script type="application/ld+json">${j}</script>`),
  ].join("\n");
  return `<!doctype html><html${lang ? ` lang="${lang}"` : ""}><head>${head}</head><body><main>${body}</main></body></html>`;
}

type Route = { status?: number; type?: string; body?: string; location?: string };

function serve(routes: Record<string, Route>): Promise<Server> {
  const server = createServer((req, res) => {
    const route = routes[req.url ?? ""];
    if (!route) return res.writeHead(404).end();
    res.writeHead(route.status ?? 200, {
      "content-type": route.type ?? "text/html; charset=utf-8",
      ...(route.location ? { location: route.location } : {}),
    });
    res.end(route.body ?? "");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const sitemap = (urls: string[]) =>
  `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

const ROBOTS = `User-agent: *\nUser-agent: GPTBot\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap-index.xml\n`;

function site(pages: PageSpec[], extra: Record<string, Route> = {}): Record<string, Route> {
  const urls = pages.map((p) => `${SITE}${p.path}`);
  return {
    "/robots.txt": { type: "text/plain", body: ROBOTS },
    "/sitemap-index.xml": { type: "application/xml", body: sitemap([`${SITE}/sitemap-0.xml`]) },
    "/sitemap-0.xml": { type: "application/xml", body: sitemap(urls) },
    "/og.png": { type: "image/png", body: "png" },
    "/llms.txt": { type: "text/plain; charset=utf-8", body: urls.join("\n") },
    ...Object.fromEntries(pages.map((p) => [p.path, { body: page(p) }])),
    ...extra,
  };
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "geo-audit-"));
  writeFileSync(join(dir, "profile.mjs"), PROFILE);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function audit(routes: Record<string, Route>) {
  const server = await serve(routes);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    return await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [script, base, "--profile", "profile.mjs"], { cwd: dir });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      // The parser's own wording differs between Node versions.
      const normalized = () => stdout.replace(/(JSON-LD does not parse: ).*/g, "$1<parser message>");
      child.on("close", (status) => resolve({ status, stdout: normalized(), stderr }));
    });
  } finally {
    server.close();
  }
}

const de = (path: string, en: string) => ({ de: `${SITE}${path}`, en: `${SITE}${en}`, "x-default": `${SITE}${path}` });

describe("geo-audit", () => {
  it("passes a site that follows every rule", async () => {
    const r = await audit(
      site([
        {
          path: "/",
          // An entity counts as one character; a script is not visible text.
          title: "Preise &amp; Pakete",
          alternates: de("/", "/en/"),
          body: `<h1>Start</h1><p>${words}</p><a href="/en/">EN</a><script>const s = "nahtlos";</script>`,
        },
        { path: "/en/", lang: "en", alternates: de("/", "/en/") },
      ]),
    );
    expect(r.stderr).toBe("");
    expect(r.stdout).toMatchInlineSnapshot(`
      "Audited 2 pages, 1 internal link targets, 1 social images, 37 checks.
        /  (15/43 chars, 15 words)
        /en/  (10/46 chars, 10 words)

      No hard failures.
      "
    `);
    expect(r.status).toBe(0);
  });

  it("stops when there is no sitemap to read", async () => {
    const r = await audit({ "/robots.txt": { type: "text/plain", body: ROBOTS } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("/sitemap-index.xml answered 404 — nothing to audit.");
  });

  it("fails a sitemap that lists no page", async () => {
    const r = await audit(site([]));
    expect(r.stdout).toContain("✗ sitemap: lists no page");
    expect(r.status).toBe(1);
  });

  it("names every rule a broken site breaks", async () => {
    const date = "2026-11-01";
    const r = await audit(
      site(
        [
          {
            path: "/",
            alternates: de("/", "/en/"),
            body:
              `<h1>Start</h1><h3>Sprung</h3><p>${words} nahtlos</p><img src="/a.png">` +
              `<a href="/gone/">weg</a><a href="/moved/">alt</a><a href="/api/x">api</a><a href="mailto:a@b.c">m</a><a href="http://[">kaputt</a>` +
              `<a href="https://other.test/x">fremd</a>`,
          },
          {
            path: "/en/",
            lang: "en",
            alternates: { ...de("/", "/en/"), "x-default": `${SITE}/en/` },
            // A second link to /gone/: the report names the first page that linked.
            body: `<h1>Home</h1><p>${words}</p><a href="/gone/">gone</a>`,
          },
          {
            path: "/doppelt/",
            title: "Seite /",
            description: "zu kurz",
            lang: null,
            canonical: null,
            alternates: { de: `${SITE}/doppelt/`, en: `${SITE}/nirgends/` },
            ogImage: `${SITE}/og-missing.png`,
            body: "<h1>Eins</h1><h1>Zwei</h1>",
            jsonld: [
              "{ not json",
              JSON.stringify({
                "@graph": [
                  { "@type": "WebPage", "@id": `${SITE}/#x`, about: { "@id": `${SITE}/#nobody` } },
                  { "@type": "Organization", "@id": `${SITE}/#x`, aggregateRating: { "@type": "AggregateRating" } },
                  { "@type": "Product", publisher: { "@id": `${SITE}/#org` } },
                ],
              }),
            ],
          },
          { path: "/versteckt/", robots: "noindex, follow", title: "X".repeat(61) },
          {
            path: "/guide/eins/",
            // The dated posting represents the page, not the undated stub before it.
            jsonld: [JSON.stringify([{ "@type": "WebPage" }, { "@type": "TechArticle", dateModified: date }])],
            // A link to the site's own domain is no outside source.
            body:
              `<h1>Guide</h1><p>${words}</p><table><tr><td>a</td></tr></table>` +
              `<a href="https://www.example.test/q">q</a>`,
          },
          { path: "/guide/zwei/", jsonld: [JSON.stringify({ "@type": "WebPage" })] },
          { path: "/kontakt/", body: "<h1>Kontakt</h1>" },
          { path: "/leer/", title: "", description: "", ogImage: null, body: `<p>${words}</p>` },
          { path: "/fehlt/" },
        ],
        {
          "/fehlt/": { status: 404 },
          "/gone/": { status: 410 },
          "/moved/": { status: 301, location: "/" },
          "/og-missing.png": { status: 404, type: "text/html" },
          "/robots.txt": {
            type: "text/plain",
            // Two groups: the second agent must not inherit the first one's rules.
            body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /api/\n",
          },
          "/sitemap-index.xml": {
            type: "application/xml",
            body: sitemap([`${SITE}/sitemap-0.xml`, `${SITE}/sitemap-1.xml`]),
          },
          "/llms.txt": { type: "text/html", body: `${SITE}/\n`.repeat(40) },
        },
      ),
    );
    expect(r.stderr).toBe("");
    expect(r.stdout).toMatchSnapshot();
    expect(r.status).toBe(1);
  });
});
