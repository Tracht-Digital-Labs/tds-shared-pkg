/**
 * `scripts/pack-release.mjs`, run the way a consumer's `postbuild` runs it:
 * `node <script>` with the consumer's root as the working directory, against a
 * fake `dist/`. No case here lists `runtimeDependencies`, so nothing installs.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFingerprint } from "../cache/dirs";

const script = join(__dirname, "..", "..", "scripts", "pack-release.mjs");
const packagedStartup = join(__dirname, "..", "..", "scripts", "app.cjs");

interface Site {
  release?: Record<string, unknown> | null;
  /** Files under the site root, `dist/…` included. */
  files?: Record<string, string>;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const DEFAULT_FILES = {
  "dist/server/entry.mjs": 'import { a } from "./chunks/a.mjs";\nimport fs from "node:fs";\nimport path from "path";\n',
  "dist/client/.htaccess": "RewriteCond %{DOCUMENT_ROOT}/_tds-cache/.build-@TDS_BUILD@ -f\n",
  "dist/client/_astro/index.abc123.js": "",
};

function pack({ release = { name: "example-site" }, files = {} }: Site = {}) {
  const root = mkdtempSync(join(tmpdir(), "pack-release-"));
  roots.push(root);
  const pkg = { name: "example", version: "1.2.3", ...(release ? { tds: { release } } : {}) };
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  for (const [rel, content] of Object.entries({ ...DEFAULT_FILES, ...files })) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  const run = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  const out = join(root, "release");
  return {
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    out,
    read: (rel: string) => readFileSync(join(out, rel), "utf8"),
    has: (rel: string) => existsSync(join(out, rel)),
  };
}

/** A site whose server bundle has one more file with `source` in it. */
const bundling = (source: string, release?: Record<string, unknown>) =>
  pack({ release: { name: "example-site", ...release }, files: { "dist/server/chunks/extra.mjs": source } });

describe("pack-release: the tree", () => {
  it("lays out server/, client/, app.cjs, tmp/ and a public-only package.json", () => {
    const r = pack();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.read("server/entry.mjs")).toBe(DEFAULT_FILES["dist/server/entry.mjs"]);
    expect(r.has("client/_astro/index.abc123.js")).toBe(true);
    expect(r.read("tmp/.gitkeep")).toBe("");
    expect(r.read("tmp/restart.txt")).toMatch(/^built_at=\d{4}-\d\d-\d\dT[\d:.]+Z\n$/);
    expect(r.read(".gitignore")).toContain("!node_modules/");
    expect(JSON.parse(r.read("package.json"))).toEqual({
      name: "example-site",
      version: "1.2.3",
      private: true,
      type: "commonjs",
      scripts: { start: "node app.cjs" },
      dependencies: {},
    });
  });

  it("falls back to the packaged startup file when the consumer has none", () => {
    expect(pack().read("app.cjs")).toBe(readFileSync(packagedStartup, "utf8"));
  });

  it("prefers the consumer's own startup file", () => {
    expect(pack({ files: { "app.cjs": "// the site's own\n" } }).read("app.cjs")).toBe("// the site's own\n");
  });

  it("replaces an earlier release tree instead of merging into it", () => {
    const r = pack({ files: { "release/stale.txt": "left over" } });
    expect(r.status).toBe(0);
    expect(r.has("stale.txt")).toBe(false);
  });

  it("stamps every release with a unique dot-file among the assets", () => {
    const stamps = readdirSync(join(pack().out, "client", "_astro")).filter((n) => n.startsWith(".release-"));
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toMatch(/^\.release-[0-9a-f]{12}$/);
  });

  it("writes this build's fingerprint into the .htaccess gate, by the runtime's formula", () => {
    const r = pack();
    const fingerprint = buildFingerprint(join(r.out, "client", "_astro"));
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(r.read("client/.htaccess")).toBe(`RewriteCond %{DOCUMENT_ROOT}/_tds-cache/.build-${fingerprint} -f\n`);
    expect(r.stdout).toContain(`cache build gate: ${fingerprint}`);
  });

  it("leaves the placeholder when there are no assets to fingerprint", () => {
    const r = pack({ files: { "dist/client/_astro/index.abc123.js": null as unknown as string } });
    expect(r.status).toBe(0);
    expect(r.read("client/.htaccess")).toContain("@TDS_BUILD@");
  });

  it("leaves an .htaccess without a placeholder untouched", () => {
    expect(pack({ files: { "dist/client/.htaccess": "Options -Indexes\n" } }).read("client/.htaccess")).toBe(
      "Options -Indexes\n",
    );
  });

  it("copies extraFiles into the tree", () => {
    const r = pack({
      release: { name: "example-site", extraFiles: [{ from: "content/agb.md", to: "content/agb.md" }] },
      files: { "content/agb.md": "# AGB\n" },
    });
    expect(r.status).toBe(0);
    expect(r.read("content/agb.md")).toBe("# AGB\n");
  });
});

describe("pack-release: refusing to pack", () => {
  it("needs a tds.release section", () => {
    const r = pack({ release: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no `tds.release` section");
  });

  it("needs a server bundle", () => {
    const r = pack({ files: { "dist/server/entry.mjs": null as unknown as string } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("dist/server/entry.mjs is missing");
    expect(r.has("")).toBe(false);
  });

  it("needs every extraFile to exist", () => {
    const r = pack({ release: { name: "example-site", extraFiles: [{ from: "nope.md", to: "nope.md" }] } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("tds.release.extraFiles: nope.md does not exist");
  });

  it("needs an .htaccess in the document root", () => {
    const r = pack({ files: { "dist/client/.htaccess": null as unknown as string } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("release/client/.htaccess is missing");
  });
});

describe("pack-release: what the server bundle may import", () => {
  it("accepts builtins, relative imports and a clean bundle", () => {
    const r = bundling('import { x } from "../entry.mjs";\nimport os from "os";\nconst c = await import("node:crypto");\n');
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("verified: self-contained");
  });

  it("refuses a first-party import", () => {
    const r = bundling('import { t } from "@tracht-digital-labs/tds-shared/i18n";\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("imports @tracht-digital-labs/tds-shared/i18n (first-party package)");
  });

  it("ignores first-party specifiers that are only hydration-manifest data", () => {
    const r = bundling('const m = {"@tracht-digital-labs/tds-shared/components":"_astro/index.abc.js"};\n');
    expect(r.status).toBe(0);
  });

  it("refuses a static import missing from the tree, the bare side-effect form included", () => {
    const r = bundling('import "qrcode";\nimport { motion } from "motion/react";\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('imports "motion" statically');
    expect(r.stderr).toContain('imports "qrcode" statically');
  });

  it("refuses a lazy import or interop require missing from the tree", () => {
    const r = bundling('const d = __require("dijkstrajs");\nconst p = () => import("pdfjs-dist/build");\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('lazily imports "dijkstrajs"');
    expect(r.stderr).toContain('lazily imports "pdfjs-dist"');
  });

  it("lets a lazy import through when it is recorded as browser-only", () => {
    const r = bundling('const p = () => import("pdfjs-dist/build");\n', { browserOnly: ["pdfjs-dist"] });
    expect(r.status).toBe(0);
  });

  it("does not let browserOnly excuse a static import", () => {
    const r = bundling('import "pdfjs-dist";\n', { browserOnly: ["pdfjs-dist"] });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('imports "pdfjs-dist" statically');
  });

  it("refuses the build-only OG renderer", () => {
    const r = bundling('import satori from "satori";\nimport { Resvg } from "@resvg/resvg-js";\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("imports satori (build-only OG renderer)");
    expect(r.stderr).toContain("imports @resvg/resvg-js (build-only OG renderer)");
  });

  it("does not read imports out of comments", () => {
    const r = bundling(' * @example\n * import { motion } from "framer-motion";\n// import "qrcode";\n/* import "x"; */\n');
    expect(r.status).toBe(0);
  });

  it("does not take prose after the word from for a specifier", () => {
    // Minified copy: `from", hourSuffix: "` reads like an import of `, hourSuffix: `.
    const r = bundling('const copy = { a: "Abholung from", hourSuffix: "Uhr" };\n');
    expect(r.status).toBe(0);
  });

  it("names the package, not the subpath, of a scoped import", () => {
    const r = bundling('import { zodResolver } from "@hookform/resolvers/zod";\n');
    expect(r.stderr).toContain('imports "@hookform/resolvers" statically');
  });
});
