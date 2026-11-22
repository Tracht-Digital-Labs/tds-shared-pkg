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
| `scripts/geo-audit.mjs` | ~490 | Open. Shipped as the `tds-geo-audit` bin. |

Split on 2026-11-22: `scripts/pack-release.mjs` (one function per step, the start check in `release/verify.mjs`).

Split on 2026-11-21: `analytics/index.ts` (one collector per measurement in `collectors.ts`, ids in `identity.ts`),
`cache/middleware.ts` (control plane in `control.ts`, shared header names in `protocol.ts`).

Split on 2026-11-15: `install/InstallWizard.tsx` (per flow), `components/LiveChatCta.tsx`
(panes, copy), `astro/index.ts` (head and motion scripts), `app/index.ts` (sheet),
`api/index.ts` (state, runtime config), `theme/toggle.ts` (preview clone),
`components/AccountMenu.tsx` (icons).
