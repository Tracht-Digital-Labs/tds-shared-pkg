/**
 * Astro's `client:idle` timing: when the browser is idle, at most two seconds
 * later; 200 ms where `requestIdleCallback` is missing (Safari before 18).
 */
export function whenIdle(run: () => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 200);
}
