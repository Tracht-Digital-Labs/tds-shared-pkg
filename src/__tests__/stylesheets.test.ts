import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STYLES } from "./stylesheet";

/**
 * The large stylesheets are entries that import their partials. Consumers
 * import the entries by path (`@tracht-digital-labs/tds-shared/styles/base.css`),
 * so the entry names are the contract and the partials are not exported.
 */
const ENTRIES = ["primitives.css", "base.css", "app.css", "app-shell.css"];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const importsOf = (css: string) => [...css.matchAll(/^@import "\.\/([^"]+)";/gm)].map((m) => m[1] ?? "");

describe.each(ENTRIES)("%s", (entry) => {
  const dir = entry.replace(/\.css$/, "");
  const css = readFileSync(join(STYLES, entry), "utf8");

  it("holds nothing but imports, so the cascade order is the import order", () => {
    const statements = stripComments(css)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const statement of statements) expect(statement).toMatch(/^@import "\.\/[\w/-]+\.css";$/);
  });

  it("imports every partial in its folder exactly once", () => {
    const partials = readdirSync(join(STYLES, dir)).map((name) => `${dir}/${name}`);
    const imported = importsOf(css).filter((path) => path.startsWith(`${dir}/`));
    expect([...imported].sort()).toEqual([...partials].sort());
    expect(new Set(imported).size).toBe(imported.length);
  });

  it("has partials that import nothing themselves", () => {
    for (const name of readdirSync(join(STYLES, dir))) {
      const partial = stripComments(readFileSync(join(STYLES, dir, name), "utf8"));
      expect(partial, `${dir}/${name}`).not.toMatch(/@import/);
    }
  });
});
