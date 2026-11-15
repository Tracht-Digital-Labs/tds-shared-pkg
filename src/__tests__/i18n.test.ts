import { describe, expect, it } from "vitest";
import { translations } from "../i18n/translations";

/**
 * Recursively walk both locale bundles and assert the same key /
 * array shape lives in each. Returns the list of paths that diverged
 * so failures surface a useful diff instead of "objects not equal".
 *
 * Arrays compare by length only (item-level parity is asserted
 * separately for the few arrays that carry locale-independent data,
 * such as the blog fallback teasers).
 */
function shapeDiff(
  de: unknown,
  en: unknown,
  path: string,
  diffs: string[],
): void {
  if (Array.isArray(de) || Array.isArray(en)) {
    if (!Array.isArray(de) || !Array.isArray(en)) {
      diffs.push(`${path}: array vs non-array`);
      return;
    }
    if (de.length !== en.length) {
      diffs.push(`${path}: array length differs (de=${de.length} en=${en.length})`);
      return;
    }
    de.forEach((d, i) => shapeDiff(d, en[i], `${path}[${i}]`, diffs));
    return;
  }
  if (de && typeof de === "object" && en && typeof en === "object") {
    const deKeys = Object.keys(de).sort();
    const enKeys = Object.keys(en).sort();
    if (deKeys.join("|") !== enKeys.join("|")) {
      diffs.push(
        `${path}: keys differ (de=[${deKeys.join(",")}] en=[${enKeys.join(",")}])`,
      );
      return;
    }
    for (const k of deKeys) {
      shapeDiff(
        (de as Record<string, unknown>)[k],
        (en as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
        diffs,
      );
    }
    return;
  }
  if (typeof de !== typeof en) {
    diffs.push(`${path}: type differs (de=${typeof de} en=${typeof en})`);
  }
}

describe("translations", () => {
  it("exposes a `de` and `en` language", () => {
    expect(translations.de).toBeDefined();
    expect(translations.en).toBeDefined();
  });

  it("keeps the full nested shape identical between DE and EN", () => {
    const diffs: string[] = [];
    shapeDiff(translations.de, translations.en, "", diffs);
    expect(diffs, diffs.join("\n")).toEqual([]);
  });


  it("never leaves a section title empty", () => {
    for (const lang of ["de", "en"] as const) {
      const t = translations[lang];
      expect(t.blog.headline.trim().length).toBeGreaterThan(0);
      expect(t.contact.headline.trim().length).toBeGreaterThan(0);
      expect(t.footer.slogan.trim().length).toBeGreaterThan(0);
      expect(t.footer.tagline.trim().length).toBeGreaterThan(0);
    }
  });

  it("differentiates DE and EN copy on the headline strings", () => {
    // Quick sanity check that the EN bundle isn't accidentally
    // copy-pasted from DE on the surface-level strings.
    expect(translations.en.blog.headline).not.toBe(translations.de.blog.headline);
    expect(translations.en.nav.cta).not.toBe(translations.de.nav.cta);
    expect(translations.en.footer.slogan).not.toBe(translations.de.footer.slogan);
  });

  // Quality standard (tds-ops/standards/quality.md): no dashes as rhythm and
  // no running chapter numbers in anything a visitor reads.
  it("uses no dash as punctuation and no chapter numbers in visible copy", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(translations);
    const offenders = strings.filter((s) => / [–—] /.test(s) || /^— ?\d/.test(s) || /\b0\d \/ /.test(s));
    expect(offenders).toEqual([]);
  });
});
