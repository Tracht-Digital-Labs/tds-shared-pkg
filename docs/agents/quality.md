# Quality standard: exceptions and open items

The package follows `../tds-ops/standards/quality.md`. This file lists where it
does not yet, and why. Remove an entry when it is fixed.

## Files past ~400 lines

| File | Lines | Status |
|---|---|---|
| none | | |

Split on 2026-11-23: `styles/primitives.css`, `styles/base.css`, `styles/app.css` and `styles/app-shell.css` into
partials under folders of the same name. The entries stay the published paths and hold only `@import`s; all seven
consumer sites inline them with `@tailwindcss/postcss`, which already resolved `app.css` → `./primitives.css`. The
compiled CSS of a panel, blog and marketing bundle has the same rules in the same order before and after
(compared with comments stripped; only comments that named a position in the old file changed).

Split on 2026-11-22: `scripts/pack-release.mjs` (one function per step, the start check in `release/verify.mjs`),
`scripts/geo-audit.mjs` (checks per concern under `geo-audit/`).

Split on 2026-11-21: `analytics/index.ts` (one collector per measurement in `collectors.ts`, ids in `identity.ts`),
`cache/middleware.ts` (control plane in `control.ts`, shared header names in `protocol.ts`).

Split on 2026-11-15: `install/InstallWizard.tsx` (per flow), `components/LiveChatCta.tsx`
(panes, copy), `astro/index.ts` (head and motion scripts), `app/index.ts` (sheet),
`api/index.ts` (state, runtime config), `theme/toggle.ts` (preview clone),
`components/AccountMenu.tsx` (icons).
