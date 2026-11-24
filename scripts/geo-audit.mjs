#!/usr/bin/env node
/**
 * Search and answer-engine audit for a public site — what a crawler reads.
 *
 *   npm run audit:geo -- http://127.0.0.1:4411
 *   tds-geo-audit [base] [--profile scripts/geo-audit.profile.mjs]
 *
 * Deliberately NO browser. Search engines render JavaScript late and many AI
 * crawlers not at all, so every check here runs against the raw server HTML a
 * plain request returns. What only a browser can see (overflow, focus, axe)
 * is each site's `ux-audit.mjs`.
 *
 * It starts from `robots.txt` and the sitemap, exactly like a crawler, and for
 * every listed URL checks the list in `CHECK_IDS` below. The checks live in
 * `geo-audit/`: one page by itself in `page.mjs` and `jsonld.mjs`, the pages
 * together in `site.mjs`, `robots.txt` in `robots.mjs`.
 *
 * Exit code 1 on a hard failure; warnings are printed for judgement.
 *
 * It only loads the site it is pointed at — never point it at an API, and
 * never at production from a development machine.
 *
 * ── One script, four profiles (tds-shared 0.59) ───────────────────────────
 * The landing page, journal, tools site and shop each kept a byte-identical
 * copy of this file with only `PROFILE` differing, plus a test per repo to
 * keep the copies' check lists in step. The body now ships here; each site
 * keeps only its profile as `scripts/geo-audit.profile.mjs` (default export).
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { locs } from "./geo-audit/html.mjs";
import { auditPage } from "./geo-audit/page.mjs";
import { checkRobots } from "./geo-audit/robots.mjs";
import { checkDistinct, checkReciprocalHreflang } from "./geo-audit/site.mjs";

/**
 * Every universal check, by id. `src/__tests__/siteHelpers.test.ts` pins this
 * list, so dropping a check is a test failure rather than a quiet loss of
 * coverage on all four sites at once.
 */
const CHECK_IDS = [
  "robots.agents",
  "robots.disallow",
  "robots.sitemap",
  "sitemap.index",
  "sitemap.pages",
  "page.status",
  "page.noindex",
  "page.lang",
  "title.present",
  "title.length",
  "title.distinct",
  "description.present",
  "description.length",
  "description.distinct",
  "heading.single-h1",
  "heading.levels",
  "canonical.self",
  "hreflang.present",
  "hreflang.reciprocal",
  "og.title-description",
  "og.image",
  "og.image-answers",
  "jsonld.parses",
  "jsonld.required-types",
  "jsonld.forbidden-types",
  "jsonld.id-unique",
  "jsonld.id-resolves",
  "jsonld.date-visible",
  "img.alt",
  "link.internal-resolves",
  "text.banned-words",
  "text.word-count",
  "llms.status",
  "llms.type",
  "llms.budget",
  "llms.covers-sitemap",
];

const profileFlag = process.argv.indexOf("--profile");
const profilePath = resolve(
  process.cwd(),
  profileFlag > -1 ? process.argv[profileFlag + 1] : "scripts/geo-audit.profile.mjs",
);
const PROFILE = (await import(pathToFileURL(profilePath).href)).default;

const args = process.argv.slice(2).filter((arg, i, all) => arg !== "--profile" && all[i - 1] !== "--profile");
const base = (args.find((arg) => !arg.startsWith("--")) ?? PROFILE.defaultBase).replace(/\/$/, "");

const failures = [];
const warnings = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

/** A public URL of the site as the same URL on the audited server. */
const toLocal = (url) => url.replace(PROFILE.site, base);
const pathOf = (url) => new URL(url, PROFILE.site).pathname;
const get = (url) => fetch(url, { redirect: "manual", headers: { "User-Agent": "tds-geo-audit" } });

await auditRobots();
const pageUrls = await readSitemaps();
const { pages, internalLinks, imageUrls } = await auditPages(pageUrls);

checkDistinct(pages, "title", fail);
checkDistinct(pages, "description", fail);
checkReciprocalHreflang(pages, PROFILE, pathOf, fail);
await checkLinkTargets(internalLinks);
await checkSocialImages(imageUrls);
await auditLlmsTxt(pageUrls);

report();

async function auditRobots() {
  const res = await get(`${base}/robots.txt`);
  if (res.status !== 200) fail("robots.txt", `status ${res.status}`);
  else checkRobots(await res.text(), PROFILE, fail);
}

/** The page URLs every sitemap under the index lists, the way a crawler finds them. */
async function readSitemaps() {
  const index = await get(`${base}${PROFILE.sitemapIndexPath}`);
  if (index.status !== 200) {
    console.error(`${PROFILE.sitemapIndexPath} answered ${index.status} — nothing to audit.`);
    process.exit(1);
  }
  const pageUrls = [];
  for (const sitemapUrl of locs(await index.text())) {
    const res = await get(toLocal(sitemapUrl));
    if (res.status !== 200) {
      fail(sitemapUrl, `status ${res.status}`);
      continue;
    }
    pageUrls.push(...locs(await res.text()));
  }
  if (pageUrls.length === 0) fail("sitemap", "lists no page");
  return pageUrls;
}

async function auditPages(pageUrls) {
  const pages = new Map();
  const internalLinks = new Map(); // path -> first page linking to it
  const imageUrls = new Set();

  for (const url of pageUrls) {
    const path = pathOf(url);
    const res = await get(toLocal(url));
    if (res.status !== 200) {
      fail(path, `status ${res.status} for a URL listed in the sitemap`);
      continue;
    }
    const { links, ogImage, ...page } = auditPage({ html: await res.text(), path, profile: PROFILE, fail, warn });
    for (const link of links) if (!internalLinks.has(link)) internalLinks.set(link, path);
    if (ogImage) imageUrls.add(ogImage);
    pages.set(path, page);
  }
  return { pages, internalLinks, imageUrls };
}

async function checkLinkTargets(internalLinks) {
  for (const [linkPath, from] of internalLinks) {
    const res = await get(`${base}${linkPath}`);
    if (res.status >= 400) fail(from, `links to ${linkPath}, which answers ${res.status}`);
    else if (res.status >= 300) warn(from, `links to ${linkPath}, a redirect to ${res.headers.get("location")}`);
  }
}

async function checkSocialImages(imageUrls) {
  for (const image of imageUrls) {
    const res = await get(toLocal(image));
    const type = res.headers.get("content-type") ?? "";
    if (res.status !== 200 || !type.startsWith("image/")) fail(pathOf(image), `og:image answers ${res.status} ${type}`);
  }
}

async function auditLlmsTxt(pageUrls) {
  const res = await get(`${base}/llms.txt`);
  if (res.status !== 200) {
    fail("llms.txt", `status ${res.status}`);
    return;
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("text/plain")) fail("llms.txt", `content-type is ${type || "absent"}`);
  const body = await res.text();
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > PROFILE.llmsBudgetBytes) {
    fail("llms.txt", `${bytes} bytes is over the ${PROFILE.llmsBudgetBytes}-byte budget`);
  }
  // Which sitemap URLs the file has to name. Everything, unless a site says
  // otherwise: a journal indexes its ARTICLES, and listing two dozen tag pages
  // beside them would bury the content under its own taxonomy.
  for (const url of pageUrls) {
    if (PROFILE.llmsCovers && !PROFILE.llmsCovers(pathOf(url))) continue;
    if (!body.includes(url)) fail("llms.txt", `does not name ${url}`);
  }
}

function report() {
  console.log(
    `Audited ${pages.size} pages, ${internalLinks.size} internal link targets, ${imageUrls.size} social images, ` +
      `${CHECK_IDS.length + PROFILE.extraCheckIds.length} checks.`,
  );
  for (const [path, page] of pages) {
    console.log(`  ${path}  (${page.title.length}/${page.description.length} chars, ${page.words} words)`);
  }
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const message of warnings) console.log(`  · ${message}`);
  }
  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    for (const message of failures) console.log(`  ✗ ${message}`);
    process.exit(1);
  }
  console.log("\nNo hard failures.");
}
