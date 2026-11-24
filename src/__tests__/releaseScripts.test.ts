/**
 * The release spine — `scripts/pack-release.mjs` + `scripts/app.cjs` — is
 * consumed by PATH, not by specifier:
 *
 *     node node_modules/@tracht-digital-labs/tds-shared/scripts/pack-release.mjs
 *
 * Nothing in TypeScript, in tsup or in any consumer's build refers to these two
 * files, so every ordinary gate in this repo is blind to them. What is not
 * blind is a consumer's deploy: drop them from `files` and every panel product
 * fails its postbuild with a bare MODULE_NOT_FOUND naming a path inside
 * node_modules, a long way from this package. What the script does is
 * `packRelease.test.ts`; this file holds what ships.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("release scripts", () => {
  it("publishes the scripts directory", () => {
    expect(pkg.files).toContain("scripts");
  });

  it("ships every file of the spine", () => {
    for (const file of ["scripts/pack-release.mjs", "scripts/release/verify.mjs", "scripts/app.cjs"]) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });

  it("keeps the startup file CommonJS", () => {
    // Passenger loads the app with `require(startupFile)`. A static `import`
    // makes the file ESM, and `require` of ESM throws ERR_REQUIRE_ESM — which
    // Passenger shows as its generic error page, with the cause only in the
    // app log. A dynamic `import(...)` is fine and is how it loads the server.
    const src = read("scripts/app.cjs");
    expect(src).not.toMatch(/^\s*import\s+[\w{*]/m);
    expect(src).toMatch(/import\(".\/server\/entry\.mjs"\)/);
  });
});
