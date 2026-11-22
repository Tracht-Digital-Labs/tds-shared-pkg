/**
 * Prove a release tree can actually start on the host.
 *
 * Runs on every build, not only in CI: a gate that lives in a workflow is a
 * gate that surprises you in a workflow, and each of these failures is
 * invisible until the site is already deployed and dead.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";

/**
 * Static imports: `from "x"` AND a bare `import "x";`. The second form has no
 * `from` and was invisible here, which is how a devDependency reached
 * production a second time in one afternoon: Rolldown tree-shook the unused
 * half of a module and kept its side effects as `import "qrcode";`, the
 * release tree has no such package, and both card pages threw
 * ERR_MODULE_NOT_FOUND. `import(` cannot match — a dynamic import has a paren
 * where these have a quote — so `DYNAMIC_IMPORT` owns that form.
 *
 * Both match IMPORT STATEMENTS, not the bare package name. Astro's client
 * hydration manifest maps module specifiers to emitted asset paths, so
 * `"@tracht-digital-labs/tds-shared/components":"_astro/index.…js"` appears in
 * entry.mjs as DATA on every healthy build. A grep for the name alone would
 * fail this check forever, for a string that is not an import.
 */
const STATIC_IMPORT = /\b(?:from|import)\s*["']([^"']+)["']/g;

/**
 * Dynamic imports and requires. The leading `_{0,2}` is the hole this check
 * had: Rolldown does not inline a CJS package's own `require()` calls, it
 * rewrites them to its interop shim, `__require("…")`. A `\b` before `require`
 * never matches that (`_` and `r` are both word characters). `qrcode` shipped
 * that way and took both business-card pages down with
 * `Cannot find module 'dijkstrajs'` — a transitive dependency that was never in
 * the release tree, on a host with no parent node_modules to walk up into.
 */
const DYNAMIC_IMPORT = /(?:^|[^\w$])_{0,2}(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

/**
 * The regexes also match the word "from" inside ordinary string content —
 * minified German copy managed `…, hourSuffix: "…` — so a capture has to look
 * like a module specifier before it is believed.
 */
const SPECIFIER = /^[@a-zA-Z0-9][@a-zA-Z0-9._~/-]*$/;

const FIRST_PARTY = "@tracht-digital-labs/";

/**
 * @param {string} out  the release tree
 * @param {{ runtimeDependencies?: Record<string, string>, browserOnly?: string[] }} config  `tds.release`
 * @returns {string[]} what would keep the tree from starting; empty when it is fine
 */
export function verifyReleaseTree(out, config) {
  const runtimeDependencies = config.runtimeDependencies ?? {};
  const problems = [];

  for (const required of ["app.cjs", "server/entry.mjs", "client/.htaccess"]) {
    if (!existsSync(join(out, required))) problems.push(`release/${required} is missing`);
  }

  const { forbidden, unresolved, unresolvedLazy } = scanServerBundle(out, runtimeDependencies);
  problems.push(...forbidden);

  for (const name of unresolved) {
    problems.push(
      `server bundle imports "${name}" statically, and it is not in the release ` +
        "tree — add it to tds.release.runtimeDependencies, or bundle it via " +
        "vite.ssr.noExternal",
    );
  }

  // A DYNAMIC import is resolved when the line RUNS. The tool packs use that
  // deliberately — `pdfjs-dist` and `tesseract.js` are megabyte-sized
  // browser-only engines fetched inside a click handler, so the server bundle
  // mentions them and never executes them. They may be absent, but only by
  // NAME in `tds.release.browserOnly`, so the exception is a recorded decision
  // rather than a silent hole. A static import has no such exception: it is
  // resolved when the module loads, before the server can answer anything.
  const browserOnly = new Set(config.browserOnly ?? []);
  for (const name of unresolvedLazy) {
    if (browserOnly.has(name)) continue;
    problems.push(
      `server bundle lazily imports "${name}", which is not in the release tree. ` +
        "If that code path can run on the server, ship it in " +
        "tds.release.runtimeDependencies; if it is browser-only (a click handler " +
        `in a client island), record it in tds.release.browserOnly as "${name}".`,
    );
  }

  const shipped = JSON.parse(readFileSync(join(out, "package.json"), "utf8"));
  for (const name of Object.keys(shipped.dependencies ?? {})) {
    if (name.startsWith(FIRST_PARTY)) {
      problems.push(`release/package.json depends on ${name}; the host has no registry token`);
    }
  }

  return problems;
}

/**
 * Every bare specifier the server bundle still imports has to resolve inside
 * THIS tree. The host has no parent directory to fall back on, so anything
 * missing is an ERR_MODULE_NOT_FOUND on its first request in production — and
 * locally it is worse than an error: Node walks up and finds the development
 * checkout's node_modules, which loaded a SECOND copy of React and made every
 * island hook throw "Cannot read properties of null (reading 'useState')" from
 * a stack that names neither cause.
 */
function scanServerBundle(out, runtimeDependencies) {
  const rules = forbiddenImports(runtimeDependencies);
  const forbidden = [];
  const unresolved = new Set();
  const unresolvedLazy = new Set();

  const consider = (specifier, file, lazy) => {
    const rule = rules.find((r) => r.test(specifier));
    if (rule) forbidden.push(`server bundle imports ${specifier} (${rule.why}): ${file}`);

    if (specifier.startsWith(".") || specifier.startsWith("node:")) return;
    if (!SPECIFIER.test(specifier) || isBuiltin(specifier)) return;

    const name = packageOf(specifier);
    if (existsSync(join(out, "node_modules", name))) return;
    (lazy ? unresolvedLazy : unresolved).add(name);
  };

  for (const file of walk(join(out, "server"))) {
    const source = codeOnly(readFileSync(file, "utf8"));
    for (const match of source.matchAll(STATIC_IMPORT)) consider(match[1], file, false);
    for (const match of source.matchAll(DYNAMIC_IMPORT)) consider(match[1], file, true);
  }

  return { forbidden, unresolved: [...unresolved].sort(), unresolvedLazy: [...unresolvedLazy].sort() };
}

/** Imports the server bundle must never keep, whether or not they resolve. */
function forbiddenImports(runtimeDependencies) {
  return [
    // The host would need a GitHub Packages token to boot — add the package to
    // `vite.ssr.noExternal` in astro.config.mjs.
    { test: (s) => s.startsWith(FIRST_PARTY), why: "first-party package" },
    // Build-only UNLESS the site ships them: the journal renders its OG cards
    // on demand and lists satori + @resvg/resvg-js in runtimeDependencies.
    {
      test: (s) => (s === "satori" || s.startsWith("@resvg/")) && !(s in runtimeDependencies),
      why: "build-only OG renderer",
    },
  ];
}

/**
 * Drop comment lines before looking for imports.
 *
 * Rollup keeps the original JSDoc, and library documentation is full of
 * `@example` blocks containing real-looking import statements — framer-motion
 * ships two. Scanning them reported a bundled package as missing from the
 * release tree, i.e. a build that failed for a line of prose.
 *
 * Line-based rather than a comment parser: Astro's SSR output is unminified,
 * one statement per line, and a parser here would be more machinery than the
 * question deserves.
 */
function codeOnly(source) {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

/** `motion/react` → `motion`, `@hookform/resolvers/zod` → `@hookform/resolvers`. */
function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Node builtins, with or without the `node:` prefix. */
function isBuiltin(specifier) {
  return builtinModules.includes(packageOf(specifier));
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(mjs|js|cjs)$/.test(entry.name)) yield full;
  }
}
