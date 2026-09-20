#!/usr/bin/env python3
"""Refuse to ship a credential that grants more than it should.

The tricky case this exists for: Supabase's anon key and service_role key are
both JWTs and look identical at a glance. The anon key BELONGS in
assets/js/config.js — it is public by design and grants nothing on its own.
The service_role key bypasses row level security completely and must never
reach this repo.

So rather than pattern-matching the word, this decodes every JWT it finds and
checks the role claim. Pasting the wrong key into config.js is the exact
mistake that would hand the database to the internet, and it is caught here.

    python3 tools/check-secrets.py
"""
import base64
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SKIP = {".git", "node_modules", "assets/vendor", "assets/fonts", "assets/img", "assets/docs"}
# These discuss the key by name, which is not the same as containing one.
PROSE = {"db", "tools/check-secrets.py", "README.md", "assets/js/config.js"}

JWT = re.compile(r'\beyJ[A-Za-z0-9_-]{6,}\.([A-Za-z0-9_-]{6,})\.[A-Za-z0-9_-]{6,}')
OTHER = [
    ("private key block", re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
    ("password assignment", re.compile(
        r'(password|passwd|secret|api[_-]?key)\s*[:=]\s*[\'"][^\'"\s]{12,}[\'"]', re.I)),
]


def jwt_role(payload_b64: str):
    """Return the role claim of a JWT payload, or None if it will not decode."""
    pad = payload_b64 + "=" * (-len(payload_b64) % 4)
    try:
        claims = json.loads(base64.urlsafe_b64decode(pad))
    except Exception:
        return None
    return claims.get("role")


def skipped(rel: str) -> bool:
    return any(rel == s or rel.startswith(s + "/") for s in SKIP)


def main() -> int:
    findings = []
    checked_keys = 0

    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = str(path.relative_to(ROOT))
        if skipped(rel):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        for m in JWT.finditer(text):
            line = text[: m.start()].count("\n") + 1
            role = jwt_role(m.group(1))
            checked_keys += 1
            if role == "anon":
                continue  # public by design
            label = f"JWT with role={role!r}" if role else "JWT (unreadable payload)"
            findings.append(f"{rel}:{line}: {label}")

        if rel in PROSE:
            continue
        for label, pattern in OTHER:
            for m in pattern.finditer(text):
                line = text[: m.start()].count("\n") + 1
                findings.append(f"{rel}:{line}: {label} -> {m.group(0)[:40]}")

    if findings:
        print("SECRETS FOUND — do not commit:")
        for f in findings:
            print("  " + f)
        print("\nIf this is a Supabase key: only the anon key belongs in this repo.")
        return 1

    note = f" ({checked_keys} JWT(s) checked, all role=anon)" if checked_keys else ""
    print("No secrets found." + note)
    return 0


if __name__ == "__main__":
    sys.exit(main())
