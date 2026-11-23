import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The package's `styles/` directory. */
export const STYLES = join(__dirname, "..", "..", "styles");

/**
 * A published stylesheet with its partials inlined, in import order: what a
 * consumer's build sees of it. `primitives.css`, `base.css`, `app.css` and
 * `app-shell.css` are lists of `@import "./<entry>/<part>.css"`, so a rule
 * about one of them has to read the assembled text.
 *
 * Only the entry's own partials are inlined. `app.css` also imports the
 * sibling entry `./primitives.css`; that line stays, so a test about app.css
 * still reads app.css and not primitives.css as well.
 */
export function readStylesheet(entry: string): string {
  const css = readFileSync(join(STYLES, entry), "utf8");
  return css.replace(/^@import "\.\/([\w-]+\/[\w-]+\.css)";\r?$/gm, (_, partial: string) =>
    readFileSync(join(STYLES, dirname(entry), partial), "utf8"),
  );
}
