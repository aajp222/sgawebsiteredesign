# WPI SGA Website Redesign

A rebuild of [wp.wpi.edu/sga](https://wp.wpi.edu/sga/) styled after the SGA Instagram presence
([@wpi.sga](https://www.instagram.com/wpi.sga/)) — bold, graphic, and built around what students
actually come to the site for: funding, meetings, and getting involved.

Plain HTML, CSS, and JavaScript. No framework, no build step, no dependencies.

## Run it

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host works — GitHub Pages, Netlify, or a folder on a WPI web server.

## Structure

```
*.html                    10 pages, one file each
assets/css/tokens.css     design tokens — edit this to re-skin the whole site
assets/css/base.css       reset, typography, layout primitives
assets/css/components.css nav, hero, cards, tables, accordion, footer
assets/js/site.js         mobile nav, accordions, scroll reveal, minutes filter
assets/img/               logo and Instagram post images
assets/docs/              governing document PDFs
tools/partials/           shared header and footer markup
tools/sync-partials.py    pushes the partials into all 10 pages
```

## Re-skinning

Every color, font, and spacing value lives in `assets/css/tokens.css`. Change a token there and
the whole site follows — no page markup needs touching.

The palette currently shipping is a **placeholder** built on WPI crimson. To match the Instagram
feed, sample its colors and the display typeface and replace the values under `--- Brand palette ---`
and `--- Typography ---`.

One accessibility constraint to preserve: `--highlight` (gold) only reaches 3.97:1 on crimson, so
small text on a crimson background uses the lighter `--highlight-soft` instead. If you change the
gold, check both against crimson and keep small text at 4.5:1 or better.

## Editing the nav or footer

The header and footer markup is repeated in all ten pages — the cost of having no build step.
Don't edit them page by page. Edit `tools/partials/header.html` or `tools/partials/footer.html`,
then run:

```bash
python3 tools/sync-partials.py
```

It rewrites the marked regions in every page and leaves everything else alone.

The active nav item is driven by `<body data-page="...">`, so the header markup is byte-identical
across pages.

## What still needs real content

Search the source for `TODO` — each one marks a placeholder:

- **Instagram grid** (`index.html`) — nine placeholder tiles awaiting real post images and permalinks
- **Officer names and photos** (`structure.html`) — roles are listed, people are not
- **Governing documents** (`governing-documents.html`) — PDFs go in `assets/docs/`
- **Minutes archive** (`meetings.html`) — the table shows format-only placeholder rows
- **Budget documents** (`financials.html`)
- **Election dates** (`join.html`)
- **SGA logo** — the header currently uses a text mark; drop an SVG into `assets/img/`

One data question carried over from the old site: it listed the Chief Justice under
`sgasenatechair@wpi.edu`, which looks like two roles crossed. `contact.html` lists that address
under Senate Chair instead — confirm the Chief Justice's own address before launch.

## Accessibility

- Every page works with JavaScript disabled — accordions render expanded, nav renders as a list
- Skip link, sequential headings, one `<h1>` per page, visible focus rings
- All text meets WCAG AA contrast (verified against the shipping palette)
- `prefers-reduced-motion` disables scroll reveal and smooth scrolling
