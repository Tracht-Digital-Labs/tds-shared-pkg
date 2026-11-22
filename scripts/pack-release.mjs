/**
 * Assemble the deployable tree the production host checks out.
 *
 * Runs as `postbuild`, so `npm run build` alone produces everything the host
 * needs and CI has nothing site-specific to remember.
 *
 * ### Why this exists at all
 *
 * The host runs the site as a Node app under Passenger, and it must be able to
 * start it **without `npm install`**. Our own packages live on GitHub
 * Packages, so any install on the host would need a PAT with `read:packages`
 * on a machine that has no business holding one. The answer is two-tier:
 * everything first-party is bundled into `server/` by `vite.ssr.noExternal`
 * (see `astro.config.mjs`), and the small remainder that *cannot* be bundled —
 * native addons, and packages whose CJS interop does not survive Rollup — is
 * installed here, on the CI runner, from the public registry only, and shipped
 * inside the release tree.
 *
 * ### The layout, and why it is not negotiable
 *
 *   app.cjs        Passenger startup file (CommonJS — see the file's own note)
 *   package.json   minimal, public-registry deps only
 *   server/        the SSR bundle. NOT web-reachable: document root is client/
 *   client/        document root — hashed assets, prerendered pages, .htaccess
 *   node_modules/  prebuilt, linux-x64, no first-party packages
 *   tmp/           so `touch tmp/restart.txt` works as a deploy action
 *
 * `server/` and `client/` must stay siblings under exactly those names:
 * `@astrojs/node` resolves the client directory at runtime by walking up from
 * its own module URL to the folder named like `build.server` and applying the
 * server→client offset. Flattening `client/` into the tree root breaks static
 * serving in a way that only shows up on the host.
 *
 * ### Where this file lives
 *
 * It used to be copied into each site that needed it, with the instruction
 * "fix it once, copy it three times; do not fork it" — an instruction that
 * does not survive a fifth copy, which is what the two panel products would
 * have made it. It is published from `tds-shared` instead and consumed as
 *
 *     "postbuild": "node node_modules/@tracht-digital-labs/tds-shared/scripts/pack-release.mjs"
 *
 * There is no `exports` entry for it and none is needed: `node <path>` is a
 * filesystem lookup, not specifier resolution. The per-consumer values come
 * from `tds.release` in `package.json`, the same convention
 * `scripts/lint-primitives.mjs` uses.
 *
 * Every consumer runs this copy since 0.46.0. The check that the tree can
 * start on the host lives beside it in `release/verify.mjs`.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyReleaseTree } from "./release/verify.mjs";

// The CONSUMER's root, not this script's. npm sets the cwd of every lifecycle
// script to the package root; deriving it from `import.meta.url` would resolve
// to `node_modules/@tracht-digital-labs/` once published.
const root = process.cwd();
const dist = join(root, "dist");
const out = join(root, "release");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const config = pkg.tds?.release ?? abort("package.json has no `tds.release` section.");

requireServerBuild();
clearReleaseTree();
cpSync(join(dist, "server"), join(out, "server"), { recursive: true });
cpSync(join(dist, "client"), join(out, "client"), { recursive: true });
stampRelease();
writeBuildGate();
cpSync(startupFile(), join(out, "app.cjs"));
writeRestartSignal();
writeGitignore();
copyExtraFiles();
writeManifest();
installRuntimeDependencies();

const problems = verifyReleaseTree(out, config);
if (problems.length > 0) {
  abort(`the release tree would not start on the host:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
}
console.log("[pack-release] verified: self-contained, no first-party or native OG imports");
console.log(`[pack-release] release tree ready at ${out}`);

function abort(message) {
  console.error(`[pack-release] ${message}`);
  process.exit(1);
}

/**
 * A build that produced no server bundle is a build that silently stayed
 * static — the single most likely way this regresses, and one that would
 * otherwise ship a tree Passenger cannot start.
 */
function requireServerBuild() {
  for (const required of ["server/entry.mjs", "client"]) {
    if (!existsSync(join(dist, required))) {
      abort(
        `dist/${required} is missing. Is \`output: "server"\` still set, ` +
          "and is the Node adapter still configured?",
      );
    }
  }
}

function clearReleaseTree() {
  try {
    // Retries absorb the transient locks a virus scanner or an editor takes on
    // a freshly written tree; a server still running out of `release/` holds it
    // for good, which is what the message below is for.
    rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    abort(
      `could not clear ${out}: ${err?.code ?? err}\n` +
        "  On Windows this is almost always a smoke-test server still running " +
        "out of that directory — stop it and build again.",
    );
  }
  mkdirSync(out, { recursive: true });
}

/**
 * One unique, empty file among the assets per release. The build fingerprint
 * hashes the NAMES under `_astro`, and a build that changed only markup — the
 * journal inlines all of its CSS — kept every name, so the booted app judged
 * the old cache current and served yesterday's pages after a deploy.
 * Dot-named, so the directory listing is all it ever appears in.
 */
function stampRelease() {
  const assets = join(out, "client", "_astro");
  if (!existsSync(assets)) return;
  const id = createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 12);
  writeFileSync(join(assets, `.release-${id}`), "");
}

/**
 * The build gate (src/cache/dirs.ts, BUILD_GATE_PREFIX). The web server serves
 * cached pages straight from disk, so after a deploy it kept handing out pages
 * that named the previous build's deleted CSS — unstyled until Node happened to
 * boot and flush. `.htaccess` requires `_tds-cache/.build-<fingerprint>`, which
 * only the booted app lays down, and this puts the fingerprint of THIS build
 * into the rule. Same formula as `buildFingerprint()`; packRelease.test.ts
 * holds the two together. A site whose .htaccess has no placeholder is left
 * as it is.
 */
function writeBuildGate() {
  const htaccess = join(out, "client", ".htaccess");
  if (!existsSync(htaccess)) return;
  const rules = readFileSync(htaccess, "utf8");
  if (!rules.includes("@TDS_BUILD@")) return;

  let names = [];
  try {
    names = readdirSync(join(out, "client", "_astro"));
  } catch {
    names = [];
  }
  // No assets, no fingerprint: the app writes no gate either, so the
  // placeholder stays — the condition never matches and every request goes to
  // Node, which is slower but correct.
  if (names.length === 0) return;
  const build = createHash("sha256").update(names.sort().join("\n")).digest("hex").slice(0, 16);
  writeFileSync(htaccess, rules.replaceAll("@TDS_BUILD@", build));
  console.log(`[pack-release] cache build gate: ${build}`);
}

/**
 * A consumer may keep its own startup file — the public sites do, and theirs
 * is byte-identical to the canonical one shipped beside this script. The panel
 * products have none, for the same reason they have no `src/`: they are
 * composition repos and own no application source at all.
 */
function startupFile() {
  const own = join(root, "app.cjs");
  return existsSync(own) ? own : fileURLToPath(new URL("app.cjs", import.meta.url));
}

/**
 * Passenger watches `tmp/restart.txt`. A unique value on every build makes a
 * Git pull recycle the worker instead of serving the previous SSR manifest
 * beside freshly deployed client assets. `tmp/` itself has to exist so
 * `touch tmp/restart.txt` works as a deploy action.
 */
function writeRestartSignal() {
  mkdirSync(join(out, "tmp"), { recursive: true });
  writeFileSync(join(out, "tmp", ".gitkeep"), "");
  writeFileSync(join(out, "tmp", "restart.txt"), `built_at=${new Date().toISOString()}\n`);
}

/**
 * This tree IS the deployable artefact, node_modules included. The un-ignore
 * is insurance against a global or inherited ignore rule quietly dropping it
 * from the published branch, which would leave the host with an app that
 * cannot resolve `astro`.
 */
function writeGitignore() {
  writeFileSync(
    join(out, ".gitignore"),
    "# The release branch ships the runtime. Nothing here is ignorable.\n!node_modules/\n",
  );
}

/**
 * Files a server-rendered route reads from disk at runtime. Anything resolved
 * against `process.cwd()` is resolved against the PROJECT ROOT during the build
 * and against the DEPLOY TREE on the host — and the deploy tree has no `src/`.
 * The landing page's committed fallback AGB is the live example: server-
 * rendered, it silently 404'd in production, which is precisely the outcome a
 * committed fallback exists to prevent.
 */
function copyExtraFiles() {
  for (const { from, to } of config.extraFiles ?? []) {
    const source = join(root, from);
    if (!existsSync(source)) abort(`tds.release.extraFiles: ${from} does not exist`);
    cpSync(source, join(out, to), { recursive: true });
    console.log(`[pack-release] copied ${from} -> ${to}`);
  }
}

/**
 * `"type": "commonjs"` so Passenger's require() of app.cjs is unambiguous even
 * if the file is ever renamed. No first-party dependency may appear here: that
 * is the whole point of the exercise, and the verification checks it.
 */
function writeManifest() {
  const manifest = {
    name: config.name,
    version: pkg.version,
    private: true,
    type: "commonjs",
    scripts: { start: "node app.cjs" },
    dependencies: config.runtimeDependencies ?? {},
  };
  writeFileSync(join(out, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function installRuntimeDependencies() {
  const deps = Object.keys(config.runtimeDependencies ?? {});
  if (deps.length === 0) return;
  console.log(`[pack-release] installing runtime dependencies: ${deps.join(", ")}`);
  // A literal command string through the shell, rather than execFileSync with
  // an argument array. Two Windows-only reasons, and CI is Linux, so this path
  // exists purely so a local build produces the same tree the host gets:
  // since Node 20 a `.cmd` cannot be spawned directly (bare EINVAL naming the
  // syscall, not the cause), and passing an argument array *with* `shell: true`
  // earns a DEP0190 warning on every build. Nothing here is interpolated.
  execSync("npm install --omit=dev --no-package-lock --no-audit --no-fund", { cwd: out, stdio: "inherit" });
}
