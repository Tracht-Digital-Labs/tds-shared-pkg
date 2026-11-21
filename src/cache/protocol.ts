/**
 * The headers the middleware and the control plane's rebuild agree on.
 */

/** Carries the control token on rebuild's self-requests; forces a fresh render over a hit. */
export const REFRESH_HEADER = "x-tds-cache-refresh";

/** What the middleware did with a request. Rebuild reads it to tell "stored" from "rendered only". */
export const STATUS_HEADER = "x-tds-cache";

export type CacheStatus = "HIT" | "MISS" | "REFRESH" | "BYPASS";

/** Revalidate on every request; the etag makes that a 304. */
export const STORED_CACHE_CONTROL = "public, max-age=0, must-revalidate";
