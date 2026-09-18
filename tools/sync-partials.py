#!/usr/bin/env python3
"""Push tools/partials/{header,footer}.html into every page.

The site is plain HTML with no build step, so the nav and footer markup is
repeated in all ten pages. Edit the partials, run this once, and every page
picks up the change:

    python3 tools/sync-partials.py

Pages are edited in place between the #region / #endregion markers. Nothing
else in the file is touched, and the site works whether or not this ever runs.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARTIALS = ROOT / "tools" / "partials"

REGIONS = {
    "SITE HEADER": PARTIALS / "header.html",
    "SITE FOOTER": PARTIALS / "footer.html",
}


def main() -> int:
    pages = sorted(ROOT.glob("*.html"))
    if not pages:
        print("no pages found in", ROOT, file=sys.stderr)
        return 1

    changed = 0
    for page in pages:
        original = page.read_text()
        updated = original

        for name, partial in REGIONS.items():
            if not partial.exists():
                print(f"missing partial: {partial}", file=sys.stderr)
                return 1

            pattern = re.compile(
                r"(<!-- #region " + re.escape(name) + r"\b[^>]*-->\n)"
                r".*?"
                r"(\n<!-- #endregion " + re.escape(name) + r" -->)",
                re.DOTALL,
            )

            if not pattern.search(updated):
                print(f"{page.name}: no {name} region, skipped", file=sys.stderr)
                continue

            body = partial.read_text().strip()
            updated = pattern.sub(
                lambda m: m.group(1) + body + m.group(2), updated, count=1
            )

        if updated != original:
            page.write_text(updated)
            changed += 1
            print("updated", page.name)

    print(f"{changed} of {len(pages)} pages changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
