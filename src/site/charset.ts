/**
 * UTF-8 in the HTTP header (2026-11-15, quality standard for public sites).
 *
 * Astro's Node adapter sends `text/html` without a charset; the `<meta
 * charset>` alone leaves the browser and SEO checkers to sniff. Wire this as the
 * outermost middleware of an SSR site. Static and cached files get the same
 * from the site's `.htaccess` (`AddDefaultCharset UTF-8` + `AddCharset`).
 */
/** Text types whose header should carry `charset=utf-8`. */
const TEXTUAL = /^(text\/[\w.+-]+|application\/(json|ld\+json|xml|rss\+xml|manifest\+json|javascript))\s*(;|$)/i;

/**
 * Returns `response` with `; charset=utf-8` on a textual `Content-Type` that
 * names no charset. Everything else passes through untouched. A response with
 * immutable headers (a cached or fetched one) is copied first.
 */
export function withUtf8Charset(response: Response): Response {
  const type = response.headers.get("content-type");
  if (!type || /charset=/i.test(type) || !TEXTUAL.test(type)) return response;
  const value = `${type.replace(/;\s*$/, "")}; charset=utf-8`;
  try {
    response.headers.set("content-type", value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set("content-type", value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}
