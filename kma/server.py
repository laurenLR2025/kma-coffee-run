import hmac
import json
import os
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB = Path(os.getenv("KMA_DB", str(ROOT / "coffee.sqlite3")))
CODE = os.getenv("KMA_TEAM_CODE")
SEASONS = ("winter", "spring", "summer", "autumn")

def connect():
    return sqlite3.connect(DB, timeout=10, isolation_level=None)

def order(data):
    result = {}
    for field, limit in (("drink", 100), ("size", 20), ("temp", 10), ("milk", 60), ("extras", 240)):
        result[field] = str(data.get(field, "")).strip()[:limit]
    if not result["drink"] or result["size"] not in ("Short", "Tall", "Grande", "Venti", "Trenta") or result["temp"] not in ("Hot", "Iced"):
        raise ValueError("Enter a drink, size and temperature.")
    return result

def update(state, token, action, data):
    people = state["people"]
    run = state["run"]
    if action == "register":
        if token in people:
            return token
        if not hmac.compare_digest(str(data.get("code", "")).encode(), CODE.encode()):
            raise ValueError("Check your team code.")
        name = str(data.get("name", "")).strip()[:40]
        if not name or any(p["name"].casefold() == name.casefold() for p in people.values()):
            raise ValueError("Enter a unique name. Use your recovery key if you already joined.")
        token = secrets.token_urlsafe(32)
        people[token] = {"name": name, "favorite": None}
        return token
    if token not in people:
        raise PermissionError()
    if action == "favorite":
        people[token]["favorite"] = order(data)
    elif action == "theme":
        if data.get("theme") not in SEASONS:
            raise ValueError("Choose a season.")
        state["theme"] = data["theme"]
    elif action == "start":
        if run and not run["closed"]:
            raise ValueError("The organizer must close the current run first.")
        deadline = data.get("deadline")
        if deadline is not None and (type(deadline) is not int or deadline <= time.time()):
            raise ValueError("Choose a future deadline.")
        state["run"] = {"id": secrets.token_hex(12), "owner": token, "deadline": deadline,
                        "closed": False, "orders": {}}
    elif action in ("join", "leave", "close"):
        if not run or data.get("id") != run["id"] or run["closed"]:
            raise ValueError("This run has ended. Refresh to see the current run.")
        if action == "close":
            if run["owner"] != token:
                raise PermissionError()
            run["closed"] = True
        else:
            if run["deadline"] and time.time() >= run["deadline"]:
                raise ValueError("The deadline has passed.")
            if action == "leave":
                run["orders"].pop(token, None)
            else:
                chosen = order(data["order"]) if isinstance(data.get("order"), dict) else people[token]["favorite"]
                if chosen is None:
                    raise ValueError("Save a favorite or enter an order.")
                run["orders"][token] = chosen
    else:
        raise ValueError("Unknown action.")
    return token

def view(state, token):
    people = state["people"]
    if token not in people:
        raise PermissionError()
    run = state["run"]
    return {"me": people[token], "theme": state["theme"], "run": None if run is None else {
        "id": run["id"], "organizer": people[run["owner"]]["name"],
        "mine": run["owner"] == token, "deadline": run["deadline"], "closed": run["closed"],
        "myOrder": run["orders"].get(token),
        "orders": [{"name": people[key]["name"], **value} for key, value in run["orders"].items()]
    }}

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, content, kind="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)

    def api(self, mutate=False):
        token = self.headers.get("Authorization", "").removeprefix("Bearer ")
        try:
            data = {}
            if mutate:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 8192:
                    raise ValueError("Invalid request size.")
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError("Invalid request.")
            with connect() as db:
                db.execute("BEGIN IMMEDIATE" if mutate else "BEGIN")
                state = json.loads(db.execute("SELECT payload FROM team WHERE id=1").fetchone()[0])
                if mutate:
                    token = update(state, token, data.get("action"), data)
                    db.execute("UPDATE team SET payload=? WHERE id=1", (json.dumps(state),))
                result = view(state, token)
                if data.get("action") == "register":
                    result["key"] = token
            status = 200
        except PermissionError:
            status, result = 401, {"error": "A valid team profile is required."}
        except ValueError as exc:
            status, result = 400, {"error": str(exc)}
        self.reply(status, json.dumps(result).encode())

    def do_GET(self):
        if self.path == "/api":
            return self.api()
        assets = {"/": ("index.html", "text/html"), "/app.css": ("app.css", "text/css"),
                  "/app.js": ("app.js", "text/javascript")}
        if self.path not in assets:
            return self.reply(404, b"Not found", "text/plain")
        name, kind = assets[self.path]
        self.reply(200, (ROOT / name).read_bytes(), kind + "; charset=utf-8")

    def do_POST(self):
        if self.path == "/api":
            return self.api(True)
        self.reply(404, b"Not found", "text/plain")

if __name__ == "__main__":
    if not CODE or len(CODE) < 12:
        raise SystemExit("Set KMA_TEAM_CODE to a private team code of at least 12 characters.")
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute("CREATE TABLE IF NOT EXISTS team (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
        db.execute("INSERT OR IGNORE INTO team VALUES (1, ?)", (json.dumps({"people": {}, "run": None, "theme": "winter"}),))
    port = int(os.getenv("PORT", "8080"))
    print(f"KMA Coffee Run listening on port {port}", flush=True)
    ThreadingHTTPServer((os.getenv("HOST", "127.0.0.1"), port), Handler).serve_forever()
