/**
 * Just enough HTML reading for the audit. Regexes over server markup, not a
 * parser: the audit reads what a crawler without a browser reads, and Astro's
 * output quotes every attribute.
 */

export const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

/** Attributes of one tag as a plain object, names lower-cased. */
export function attrs(tag) {
  const out = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)) {
    out[match[1].toLowerCase()] = decode(match[2]);
  }
  return out;
}

/** The attributes of every `<name>` tag in `html`. */
export const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => attrs(m[0]));

/** A fragment's text, tags removed and whitespace collapsed. */
export const text = (fragment) => decode(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** What a reader sees: scripts, styles and comments are not visible text. */
export const visibleText = (html) =>
  text(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " "),
  );

/** Every `<loc>` in a sitemap or sitemap index. */
export const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
