/** Checks across the pages `page.mjs` collected. */

/** No two pages share a non-empty `key` (title, description). */
export function checkDistinct(pages, key, fail) {
  const first = new Map();
  for (const [path, page] of pages) {
    const value = page[key];
    if (!value) continue;
    if (first.has(value)) fail(path, `same ${key} as ${first.get(value)}`);
    else first.set(value, path);
  }
}

/** Every hreflang twin is a listed page that names the same alternates back. */
export function checkReciprocalHreflang(pages, profile, pathOf, fail) {
  for (const [path, page] of pages) {
    for (const lang of profile.langs) {
      if (!page.alternates[lang]) continue;
      const twinPath = pathOf(page.alternates[lang]);
      const twin = pages.get(twinPath);
      if (!twin) {
        fail(path, `hreflang ${lang} points at ${twinPath}, which the sitemap does not list`);
        continue;
      }
      for (const key of [...profile.langs, "x-default"]) {
        if (twin.alternates[key] !== page.alternates[key]) fail(path, `hreflang ${key} is not reciprocal with ${twinPath}`);
      }
    }
  }
}
