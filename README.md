# WPI SGA Website Redesign

A rebuild of [wp.wpi.edu/sga](https://wp.wpi.edu/sga/) in the SGA's own identity: the logo's
Garamond lettering, the logo's crimson, and a clean editorial layout built around what students
actually come to the site for — funding, meetings, and getting involved.

Plain HTML, CSS, and JavaScript. No framework, no build step, no dependencies, and **no external
requests** — fonts are self-hosted, so the site renders identically offline.

## Run it

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host works — GitHub Pages, Netlify, or a folder on a WPI web server.

## ⚠️ Font licensing — read before launching publicly

The site self-hosts **Adobe Garamond Pro**, the typeface used for "SGA" in the official logo.
It is a **commercial Adobe typeface**. The files report `fsType` *Editable Embedding*, which
governs embedding in documents — **not** serving as a webfont. An Adobe desktop license generally
does **not** permit `@font-face` self-hosting on a public site.

Before this goes live, either confirm coverage with WPI, or swap to **EB Garamond** — a free,
openly licensed Garamond revival that is already second in the font stack. Swapping is a one-line
change in `assets/css/tokens.css`: drop `'AGaramond'` from `--font-display` and add EB Garamond
(self-host it or load it from Google Fonts).

## Structure

```
*.html                    10 pages, one file each
assets/css/tokens.css     design tokens — edit this to re-skin the whole site
assets/css/base.css       @font-face, reset, typography, layout primitives
assets/css/components.css nav, hero, cards, tables, accordion, footer
assets/js/site.js         mobile nav, accordions, scroll reveal, minutes filter
assets/fonts/             Adobe Garamond Pro (4 styles, OTF)
assets/img/               the SGA logo
assets/docs/              governing document PDFs
tools/partials/           shared header and footer markup
tools/sync-partials.py    pushes the partials into all 10 pages
```

## The design system

**Type.** Garamond does the reading — headings and body copy both. A neutral **system sans** handles
small chrome only: nav, buttons, 12px uppercase labels, table headers. Garamond at that size gets
thin and hard to read, and the system stack costs nothing to load.

Adobe Garamond has a small x-height, so the base body size runs larger (19px) than a sans would.

**Color.** Everything is the crimson sampled directly from the logo PNG (`#aa192c`) plus neutrals —
warm off-white paper, near-black ink, one mid-gray. Nothing else.

**Shape.** Hairline rules and white space. No outlines, no drop shadows. Cards are defined by
spacing and a single rule above them.

All text meets WCAG AA contrast, verified against the shipping palette.

## Re-skinning

Every color, font, and spacing value lives in `assets/css/tokens.css`. Change a token there and the
whole site follows — no page markup needs touching.

## Editing the nav or footer

The header and footer markup is repeated in all ten pages — the cost of having no build step.
Don't edit them page by page. Edit `tools/partials/header.html` or `tools/partials/footer.html`,
then run:

```bash
python3 tools/sync-partials.py
```

It rewrites the marked regions in every page and leaves everything else alone. The active nav item
is driven by `<body data-page="...">`, so the header markup is byte-identical across pages.

## Three things that look odd but are deliberate

- **Arrows are CSS, not characters.** Adobe Garamond has no `U+2192` (→) glyph, so a typed arrow
  would silently fall back to another font mid-line. Every arrow is a `.chev` element drawn with
  borders instead.
- **The footer uses a text wordmark, not the logo.** Knocking the crimson logo white for the dark
  footer flattens the goat into a detail-less silhouette. The header carries the real logo.
- **The hero goat is a CSS crop of the full logo**, using its measured bounding box inside the PNG
  (x 0–827, y 9–630 of 1898×637). If the logo file is ever replaced, re-measure — the numbers are
  commented in `components.css`.

## What still needs real content

Search the source for `TODO` — each one marks a placeholder:

- **Instagram grid** (`index.html`) — nine placeholder tiles awaiting real post images and permalinks
- **Officer names and photos** (`structure.html`) — roles are listed, people are not
- **Governing documents** (`governing-documents.html`) — PDFs go in `assets/docs/`
- **Minutes archive** (`meetings.html`) — the table shows format-only placeholder rows
- **Budget documents** (`financials.html`)
- **Election dates** (`join.html`)
- **A vector logo** — `assets/img/sga-logo.png` is a raster export; an SVG would be sharper

One data question carried over from the old site: it listed the Chief Justice under
`sgasenatechair@wpi.edu`, which looks like two roles crossed. `contact.html` lists that address
under Senate Chair instead — confirm the Chief Justice's own address before launch.

## Accessibility

- Every page works with JavaScript disabled — accordions render expanded, nav renders as a list
- Skip link, sequential headings, one `<h1>` per page, visible focus rings
- `prefers-reduced-motion` disables scroll reveal and smooth scrolling
