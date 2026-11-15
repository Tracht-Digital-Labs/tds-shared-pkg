/**
 * Shared build + `<head>` helpers for the TDS Astro frontends.
 *
 * Two things live here: the `cssTarget` build pin (below) and the no-flash
 * theme bootstrap (`themeBootstrapScript`) that every site must run inline
 * in `<head>`.
 *
 * Centralises the one build setting every site MUST share: `cssTarget`.
 * The shared `.brand-header` (styles/app.css) and the landingpage header
 * author `backdrop-filter` unprefixed; the consuming sites minify with
 * lightningcss, which only adds the `-webkit-` prefix when it sees a
 * Safari build target. The minify step reads that target from
 * `vite.build.cssTarget` (it ignores `css.lightningcss.targets`).
 *
 * Without this pin lightningcss ships the property unprefixed-only and
 * the frosted-header blur silently dies in Safari <=17 — no error, no
 * test. Importing this constant instead of hand-copying the array means
 * a new frontend can't forget it, and the browser floor moves in one
 * place. See styles/app.css and tds-shared#10.
 */

export { pageTransitionOptIn, themeBootstrapScript, pageDirectionScript, speculationRules } from "./headScripts.js";
export { errorBounceScript, offscreenAnimationScript, hoverTipScript } from "./motionScripts.js";

/**
 * lightningcss prefixing targets for the CSS minify step. Includes a
 * Safari target (keeps `-webkit-backdrop-filter`) and a modern Firefox
 * (keeps the standard property). Pass to `vite.build.cssTarget`.
 */
export const cssTarget: string[] = ["chrome90", "edge90", "firefox103", "safari15"];

/**
 * Never inline a font file as a `data:` URI (0.55.1). Vite inlines assets
 * under 4 KB, and Fontsource lists a small `.woff` beside each `.woff2`: the
 * two Lato latin-ext fallbacks landed in the landing page's inlined CSS as
 * ~10 KB of base64 on EVERY page, for a format no current browser picks.
 * Other assets keep Vite's default (`undefined`).
 */
export function tdsAssetsInlineLimit(filePath: string): boolean | undefined {
  return /\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined;
}

/**
 * Drop-in `vite.build` fragment for a TDS Astro site:
 * `vite: { build: { ...tdsViteBuild } }`.
 */
export const tdsViteBuild = {
  cssMinify: "lightningcss" as const,
  cssTarget,
  assetsInlineLimit: tdsAssetsInlineLimit,
};

/**
 * The packages behind `motion`, for an SSR site's `vite.ssr.noExternal`:
 * `noExternal: [/^@tracht-digital-solutions\//, "zod", ...motionSsrNoExternal]`.
 *
 * `./components` (ToastHost, FormAlert) and `./motion/react` import `motion`,
 * which is a DEPENDENCY of this package — so it is in the tree, but Vite
 * leaves any node_modules package external in the server bundle by default.
 * The host runs the release tree without an install, and `pack-release`
 * refuses to ship a server bundle whose `import "motion"` would not resolve
 * there. Bundling it (rather than listing it in
 * `tds.release.runtimeDependencies`) also keeps the server on exactly the
 * copy the browser bundle got.
 *
 * `motion` re-exports `framer-motion`, which splits into `motion-dom` and
 * `motion-utils` — all four must be named, or the chain stops at the first
 * one left out. Kept here so a Motion upgrade that reshuffles its packages is
 * fixed once, not in every astro.config.
 */
export const motionSsrNoExternal: string[] = [
  "motion",
  "framer-motion",
  "motion-dom",
  "motion-utils",
];

/**
 * The Astro integration that registers `client:when`. Typed structurally so
 * this package needs no dependency on `astro`. The directive itself is
 * `./astro/client-when` (`src/astro/clientWhen.ts`), which documents the
 * conditions.
 *
 * Each site also declares the attribute for `astro check`:
 *
 *   declare module "astro" {
 *     interface AstroClientDirectives { "client:when"?: string }
 *   }
 */
export function tdsClientDirectives() {
  return {
    name: "tds-client-directives",
    hooks: {
      "astro:config:setup": ({
        addClientDirective,
      }: {
        addClientDirective: (directive: { name: string; entrypoint: string }) => void;
      }) => {
        addClientDirective({
          name: "when",
          entrypoint: "@tracht-digital-solutions/tds-shared/astro/client-when",
        });
      },
    },
  };
}
