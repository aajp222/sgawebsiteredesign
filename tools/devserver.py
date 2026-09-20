#!/usr/bin/env python3
"""A local stand-in for Supabase, for development and testing.

Implements the slice of the Supabase REST and Auth APIs this site actually
uses, backed by any Postgres that has had db/000_local_shim.sql, 001 and 002
applied. It exists so the whole stack can be exercised — forms, the officer
console, row level security — without a Supabase account, and so the RLS
policies are tested through the same path the browser uses.

It mirrors PostgREST where it matters: every request runs inside a transaction
that does SET LOCAL ROLE and SET LOCAL request.jwt.claims, so the policies in
db/002_rls.sql decide the outcome exactly as they do in production.

NOT FOR PRODUCTION. Tokens are signed with a throwaway secret, passwords are
compared in a local table, and CORS is wide open.

    python3 tools/devserver.py --port 8766
"""

import argparse
import base64
import hashlib
import hmac
import json
import re
import subprocess
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PGDIR = "/var/lib/postgresql/sgatest"
PGPORT = "5433"
SECRET = b"dev-only-not-a-real-secret"

TABLES = {
    "profiles", "news", "minutes", "people", "documents", "ig_posts",
    "clubs", "club_submissions", "feedback", "funding_requests",
}
IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


# --------------------------------------------------------------------------
# Postgres access. Everything goes through psql as the superuser, which then
# drops to anon/authenticated for the statement itself.
# --------------------------------------------------------------------------

def sql(statement, want_rows=True):
    inner = (
        f"psql -h {PGDIR} -p {PGPORT} -d postgres -v ON_ERROR_STOP=1 -tAq -c "
        + "'" + statement.replace("'", "'\\''") + "'"
    )
    proc = subprocess.run(["su", "postgres", "-c", inner], capture_output=True, text=True)
    if proc.returncode != 0:
        return None, (proc.stderr or proc.stdout).strip()
    if not want_rows:
        return [], None
    out = proc.stdout.strip()
    return (json.loads(out) if out else []), None


def lit(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def as_role(role, claims, body):
    """Wrap a statement the way PostgREST does: role + JWT claims, per request.

    SET LOCAL rather than select set_config(), because the select form emits a
    result row of its own and corrupts the single JSON document psql returns.
    """
    claims_json = json.dumps(claims) if claims else ""
    headers = json.dumps({"x-forwarded-for": "127.0.0.1"})
    return (
        "begin; "
        f'set local "request.jwt.claims" = {lit(claims_json)}; '
        f'set local "request.headers" = {lit(headers)}; '
        f"set local role {role}; "
        f"{body}; "
        "commit;"
    )


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------

def b64(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def unb64(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_token(sub, email):
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64(json.dumps({
        "sub": sub, "email": email, "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = b64(hmac.new(SECRET, signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def read_token(token):
    try:
        header, payload, sig = token.split(".")
    except ValueError:
        return None
    expected = b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    claims = json.loads(unb64(payload))
    if claims.get("exp", 0) < time.time():
        return None
    return claims


# --------------------------------------------------------------------------
# PostgREST query translation
# --------------------------------------------------------------------------

OPS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "like"}


def build_filters(params):
    clauses = []
    for key, values in params.items():
        if key in ("select", "order", "limit", "offset"):
            continue
        if not IDENT.match(key):
            continue
        for raw in values:
            op, _, val = raw.partition(".")
            if op == "is":
                clauses.append(f"{key} is {'null' if val == 'null' else lit(val)}")
            elif op in OPS:
                clauses.append(f"{key} {OPS[op]} {lit(val)}")
    return (" where " + " and ".join(clauses)) if clauses else ""


def build_order(params):
    spec = params.get("order", [None])[0]
    if not spec:
        return ""
    parts = []
    for item in spec.split(","):
        bits = item.split(".")
        col = bits[0]
        if not IDENT.match(col):
            continue
        direction = "desc" if "desc" in bits else "asc"
        nulls = " nulls last" if "nullslast" in bits else (" nulls first" if "nullsfirst" in bits else "")
        parts.append(f"{col} {direction}{nulls}")
    return (" order by " + ", ".join(parts)) if parts else ""


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "*")

    def reply(self, code, payload):
        body = json.dumps(payload).encode() if payload is not None else b""
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # --- auth context -----------------------------------------------------
    def identity(self):
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else ""
        claims = read_token(token) if token else None
        if claims and claims.get("sub"):
            return "authenticated", {"sub": claims["sub"], "role": "authenticated"}
        return "anon", None

    def body_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return None
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return None

    # --- routing ----------------------------------------------------------
    def route(self, method):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        path = parsed.path

        if path.startswith("/auth/v1/"):
            return self.auth(path, params, method)
        if path.startswith("/rest/v1/"):
            return self.rest(path[len("/rest/v1/"):], params, method)
        return self.reply(404, {"message": "not found"})

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PATCH(self):
        self.route("PATCH")

    def do_DELETE(self):
        self.route("DELETE")

    # --- auth endpoints ---------------------------------------------------
    def auth(self, path, params, method):
        if path.endswith("/token"):
            grant = params.get("grant_type", ["password"])[0]
            payload = self.body_json() or {}

            if grant == "refresh_token":
                claims = read_token(payload.get("refresh_token", "")) or {}
                if not claims.get("sub"):
                    return self.reply(401, {"error": "invalid_grant",
                                            "error_description": "Session expired."})
                return self.session(claims["sub"], claims.get("email", ""))

            email = (payload.get("email") or "").strip().lower()
            password = payload.get("password") or ""
            rows, err = sql(
                "select coalesce(json_agg(row_to_json(t)), '[]') from ("
                f"select id::text, email from auth.users where lower(email) = {lit(email)}"
                ") t")
            if err or not rows:
                return self.reply(400, {"error": "invalid_grant",
                                        "error_description": "Invalid login credentials"})
            # Dev only: any non-empty password is accepted for a known user.
            if not password:
                return self.reply(400, {"error": "invalid_grant",
                                        "error_description": "Invalid login credentials"})
            return self.session(rows[0]["id"], rows[0]["email"])

        if path.endswith("/user"):
            _, claims = self.identity()
            if not claims:
                return self.reply(401, {"message": "not signed in"})
            rows, _ = sql(
                "select coalesce(json_agg(row_to_json(t)), '[]') from ("
                f"select id::text, email from auth.users where id = {lit(claims['sub'])}) t")
            if not rows:
                return self.reply(401, {"message": "not signed in"})
            return self.reply(200, self.user_obj(rows[0]["id"], rows[0]["email"]))

        if path.endswith("/logout"):
            return self.reply(204, None)

        return self.reply(404, {"message": "unsupported auth route"})

    def user_obj(self, uid, email):
        return {"id": uid, "aud": "authenticated", "role": "authenticated",
                "email": email, "app_metadata": {}, "user_metadata": {},
                "created_at": "2026-01-01T00:00:00Z"}

    def session(self, uid, email):
        token = make_token(uid, email)
        return self.reply(200, {
            "access_token": token, "token_type": "bearer", "expires_in": 3600,
            "expires_at": int(time.time()) + 3600, "refresh_token": token,
            "user": self.user_obj(uid, email),
        })

    # --- rest endpoints ---------------------------------------------------
    def rest(self, table, params, method):
        if table not in TABLES:
            return self.reply(404, {"message": f"unknown table {table}"})

        role, claims = self.identity()
        wants_object = "vnd.pgrst.object" in (self.headers.get("Accept") or "")

        if method == "GET":
            where = build_filters(params)
            order = build_order(params)
            limit = params.get("limit", [None])[0]
            tail = f" limit {int(limit)}" if limit and limit.isdigit() else ""
            inner = f"select * from public.{table}{where}{order}{tail}"
            stmt = f"select coalesce(json_agg(row_to_json(t)), '[]') from ({inner}) t"
            rows, err = sql(as_role(role, claims, stmt))
            if err:
                return self.reply(403, {"message": clean(err), "code": code_of(err)})
            rows = rows or []
            if wants_object:
                return self.reply(200, rows[0] if rows else None)
            return self.reply(200, rows)

        payload = self.body_json()
        if method == "POST":
            records = payload if isinstance(payload, list) else [payload or {}]
            for rec in records:
                cols = [c for c in rec if IDENT.match(c)]
                if not cols:
                    return self.reply(400, {"message": "no valid columns"})
                names = ", ".join(cols)
                values = ", ".join(lit(rec[c]) for c in cols)
                stmt = f"insert into public.{table} ({names}) values ({values})"
                _, err = sql(as_role(role, claims, stmt), want_rows=False)
                if err:
                    return self.reply(status_for(err), {"message": clean(err), "code": code_of(err)})
            return self.reply(201, [])

        if method == "PATCH":
            where = build_filters(params)
            cols = [c for c in (payload or {}) if IDENT.match(c) and c != "id"]
            if not cols:
                return self.reply(400, {"message": "nothing to update"})
            sets = ", ".join(f"{c} = {lit(payload[c])}" for c in cols)
            stmt = f"update public.{table} set {sets}{where}"
            _, err = sql(as_role(role, claims, stmt), want_rows=False)
            if err:
                return self.reply(status_for(err), {"message": clean(err), "code": code_of(err)})
            return self.reply(204, None)

        if method == "DELETE":
            where = build_filters(params)
            stmt = f"delete from public.{table}{where}"
            _, err = sql(as_role(role, claims, stmt), want_rows=False)
            if err:
                return self.reply(status_for(err), {"message": clean(err), "code": code_of(err)})
            return self.reply(204, None)

        return self.reply(405, {"message": "method not allowed"})


def clean(err):
    for line in err.splitlines():
        if "ERROR:" in line:
            return line.split("ERROR:", 1)[1].strip()
    return err.strip().splitlines()[0] if err.strip() else "error"


def code_of(err):
    return "54000" if "Too many submissions" in err else "42501"


def status_for(err):
    return 429 if "Too many submissions" in err else 403


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8766)
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"dev Supabase stand-in on http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
