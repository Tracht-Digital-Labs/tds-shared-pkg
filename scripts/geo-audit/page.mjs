/**
 * Everything the audit checks on one page by itself. What needs other pages
 * too — distinct titles, reciprocal hreflang, link targets — is collected here
 * and checked in `site.mjs`.
 */

import { attrs, tags, text, visibleText } from "./html.mjs";
import { checkStructuredData } from "./jsonld.mjs";

/**
 * @returns {{ title: string, description: string, alternates: Record<string, string>,
 *   words: number, ogImage?: string, links: string[] }}
 */
export function auditPage({ html, path, profile, fail, warn }) {
  const head = html.slice(0, html.indexOf("</head>") + 7);
  const body = html.slice(html.indexOf("<body"));
  const kind = profile.pageKind(path);
  const check = { path, profile, fail, warn };

  const meta = checkHead({ ...check, html, head });
  checkHeadings({ ...check, body });
  checkStructuredData({ ...check, html, kind });
  if (kind.detailChecks) checkDetailPage({ ...check, body });

  for (const img of tags(body, "img")) {
    if (!("alt" in img)) fail(path, `<img src="${img.src}"> has no alt attribute`);
  }

  const words = text(body.slice(body.indexOf("<main"), body.indexOf("</main>"))).split(" ").length;
  // A page kind may lower the floor (0.64.12): a contact card or a rights
  // notice is short by design, and padding it would serve no reader.
  const minWords = kind.minWords ?? profile.minWords;
  if (words < minWords) warn(path, `only ${words} words in <main>`);

  return { ...meta, words, links: internalLinks({ ...check, body }) };
}

function checkHead({ html, head, path, profile, fail, warn }) {
  const metas = tags(head, "meta");
  const links = tags(head, "link");
  const meta = (key, value) => metas.find((m) => m[key] === value)?.content;

  const title = text(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = meta("name", "description") ?? "";
  const canonical = links.find((l) => l.rel === "canonical")?.href ?? "";
  const alternates = Object.fromEntries(
    links.filter((l) => l.rel === "alternate" && l.hreflang).map((l) => [l.hreflang, l.href]),
  );

  if (!attrs(html.match(/<html\b[^>]*>/i)?.[0] ?? "").lang) fail(path, "html has no lang");
  if (/noindex/i.test(meta("name", "robots") ?? "")) fail(path, "listed in the sitemap but served noindex");

  // An over-long title is a hard failure only where titles are code-owned.
  // On a site whose headlines come from an editor the fix is editorial, not a
  // deploy — and `pageTitle` there deliberately keeps a long headline whole
  // rather than truncating it. Reporting it is right; failing the build on
  // somebody else's sentence is not.
  if (!title) fail(path, "no <title>");
  else if (title.length > profile.titleMax) {
    const say = profile.titleMaxHard === false ? warn : fail;
    say(path, `title is ${title.length} characters: ${title}`);
  }
  const [descMin, descMax] = profile.descriptionRange;
  if (!description) fail(path, "no meta description");
  else if (description.length < descMin || description.length > descMax) {
    fail(path, `description is ${description.length} characters: ${description}`);
  }

  if (canonical !== new URL(path, profile.site).href) fail(path, `canonical is ${canonical || "missing"}`);
  // A missing alternate is a FAILURE only where every indexable page is
  // guaranteed a twin. On a journal a tag can exist in one language and not
  // the other, and on a shop a product may be published in one tree only —
  // there the honest answer is no hreflang, not a link to a 404, so the
  // absence is a warning and the reciprocity check is what catches real
  // breakage.
  for (const key of [...profile.langs, "x-default"]) {
    if (alternates[key]) continue;
    const say = profile.hreflangRequired === false ? warn : fail;
    say(path, `no hreflang ${key}`);
  }

  const ogImage = meta("property", "og:image");
  if (!meta("property", "og:title") || !meta("property", "og:description")) {
    fail(path, "Open Graph title or description missing");
  }
  if (!ogImage) fail(path, "no og:image");

  return { title, description, alternates, ogImage };
}

function checkHeadings({ body, path, profile, fail, warn }) {
  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: text(m[2]),
  }));
  const h1s = headings.filter((h) => h.level === 1).length;
  if (h1s !== 1) fail(path, `${h1s} <h1> elements`);

  // The repository holds the banned words; this catches what only the
  // rendered page shows — a panel override, a synced demo description.
  const banned = visibleText(body).match(profile.bannedWords);
  if (banned) fail(path, `banned word "${banned[0]}" in the visible text`);

  for (let i = 1; i < headings.length; i += 1) {
    const [previous, current] = [headings[i - 1], headings[i]];
    if (current.level > previous.level + 1) {
      warn(path, `heading skips from h${previous.level} to h${current.level} ("${current.text.slice(0, 50)}")`);
    }
  }
}

/** A page kind with `detailChecks` is an article: lead, byline, sourced tables. */
function checkDetailPage({ body, path, profile, fail }) {
  if (!/class="lead\b/.test(body)) fail(path, "no lead paragraph under the headline");
  if (!/href="(\/en)?\/#about"/.test(body)) fail(path, "no byline linking to the person behind the page");
  if (/<table\b/.test(body)) {
    const ownHost = new URL(profile.site).host.replace(/^www\./, "");
    const outside = [...body.matchAll(/<a\b[^>]*href="(https:\/\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((href) => !href.includes(ownHost));
    if (outside.length === 0) fail(path, "a decision table without an outside source");
  }
}

/** Paths on this site the page links to, outside the profile's skipped prefixes. */
function internalLinks({ body, path, profile, fail }) {
  const found = [];
  for (const { href } of tags(body, "a")) {
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/.test(href)) continue;
    let target;
    try {
      target = new URL(href, new URL(path, profile.site));
    } catch {
      fail(path, `unparsable link ${href}`);
      continue;
    }
    if (target.origin !== profile.site) continue;
    if (profile.skipPaths.some((prefix) => target.pathname.startsWith(prefix))) continue;
    found.push(target.pathname);
  }
  return found;
}
