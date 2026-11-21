# Quality standard: exceptions and open items

The package follows `../tds-ops/standards/quality.md`. This file lists where it
does not yet, and why. Remove an entry when it is fixed.

## Files past ~400 lines

| File | Lines | Status |
|---|---|---|
| `styles/primitives.css` | ~4000 | Open. A published stylesheet entry (`./styles/primitives.css`); every consumer imports it by path and `design.test.ts` reads it as one file. Splitting it into `@import`ed partials needs a check of every consumer's CSS pipeline first. |
| `styles/base.css` | ~2240 | Open, same reason as `primitives.css`. |
| `styles/app.css` | ~880 | Open, same reason. |
| `styles/app-shell.css` | ~500 | Open, same reason. |
| `src/cache/middleware.ts` | ~440 | Open. `pageCache()` is one closure over the store and options; same refactor as `arm()`. |
| `scripts/geo-audit.mjs`, `scripts/pack-release.mjs` | ~490, ~410 | Build scripts, not shipped. Open. |

Split on 2026-11-21: `analytics/index.ts` (one collector per measurement in `collectors.ts`, ids in `identity.ts`).

Split on 2026-11-15: `install/InstallWizard.tsx` (per flow), `components/LiveChatCta.tsx`
(panes, copy), `astro/index.ts` (head and motion scripts), `app/index.ts` (sheet),
`api/index.ts` (state, runtime config), `theme/toggle.ts` (preview clone),
`components/AccountMenu.tsx` (icons).
