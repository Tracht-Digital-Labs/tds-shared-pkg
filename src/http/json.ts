/**
 * A JSON answer from one of the package's server-side endpoints (page-cache
 * control, site connection). Never cached, never sniffed as another type.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
