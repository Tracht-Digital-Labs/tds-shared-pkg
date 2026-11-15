# Copy and shared schemas

## i18n copy (`src/i18n/translations.ts`)

The DE/EN copy is the source of truth; change it here and release, never duplicate it into a frontend.

- **`footer.slogan`** is the brand claim ("Digitale Lösungen, die passen." / "Digital solutions that fit."). The landing
  page renders it as the hero H1, so one edit drives hero, footer and OG card. `hero.tagline` was removed.
- **Only what a consumer reads lives here** (2026-11-15): `nav`, `blog`, `contact`, `footer`, `errors`, `cookieNotice`,
  `consent`, `a11y`, `toast`. The landing page's old one-pager sections (`hero`, `about`, `services`, `tech`,
  `portfolio`, `process`, `pricing`, `consulting`) were removed; the landing page owns that copy in its CMS fallbacks.
- **Audience:** freelancers, small businesses and local trades. "Mittelstand" and "SaaS" stay out.
- **No free or time-boxed initial consultation, without exception:** "kostenlos" / "kostenfrei" / "30 Minuten" / "free"
  appear nowhere. The only legitimate "free" is `cookieNotice.consentText` (consent voluntariness).
- **No "echt" / "wirklich"** (the landing page scans these strings).
- **Quality standard** (`tds-ops/standards/quality.md`): no dash as punctuation, no chapter numbers ("— 05 / …"), headings
  name the subject. `i18n.test.ts` holds the first two.
- Labels that belong to one component (e.g. `AccountMenu`) live in the component, not in this bundle.

## Blog blocks (`schemas/blogBlocks`)

The source of truth for the block editor and renderer. A post's `body` is markdown (`bodyFormat="markdown"`) or a JSON
`BlogDocument` (`bodyFormat="blocks"`).

- `BlogBlockSchema` is a discriminated union; text fields hold **inline markdown**.
- `BLOG_BLOCKS` drives the editor's slash menu. `integration: "ads"` gates AdSense; `integration: "shop"` gates the
  `product` block. Admin-defined custom blocks (`type: "custom"`) are appended at runtime.
- Backends hand-mirror validation; keep them in sync. Don't move the catalog into a frontend.

## Card blocks (`schemas/cardBlocks`)

The contract between the panel editor (`tds-ext-cards-pkg`) and the card renderer (`tds-card-frontend`), which release
separately.

- **`parseCardDocument` is fail-soft per block** (unlike `CardDocumentSchema.parse`): one broken `href` costs that block,
  never the card on a customer's domain.
- An `href` may be empty, but anything non-empty must be `http(s)`, `mailto:` or `tel:` (`javascript:` would be a stored
  script).
- `Support\CardBlocks` in the extension hand-mirrors this; keep them in sync.
