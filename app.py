"""Study Planner v2 - two-sided (student + faculty). Python stdlib + SQLite only.
Run:  python backend/app.py   ->  http://localhost:5050
Faculty sign-up needs a code (default FACULTY123; change with env var FACULTY_CODE).
"""
import hashlib, hmac, json, os, secrets, sqlite3
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.realpath(os.path.join(ROOT, "..", "frontend"))
DB = os.path.join(ROOT, "studyplanner.db")
KEYF = os.path.join(ROOT, "secret.key")
TABLES = ["tasks", "assignments", "attendance", "goals", "notes", "courses"]  # private, per user
FACULTY_CODE = os.environ.get("FACULTY_CODE", "FACULTY123")
PORT = int(os.environ.get("PORT", 5050))
TYPES = {".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json"}
KEY = b""

def q(sql, a=()):
    c = sqlite3.connect(DB)
    try:
        r = c.execute(sql, a).fetchall(); c.commit(); return r
    finally: c.close()

def init():
    global KEY
    if not os.path.exists(KEYF): open(KEYF, "w").write(secrets.token_hex(32))
    KEY = open(KEYF).read().encode()
    q("CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,role TEXT,salt TEXT,pw TEXT)")
    for t in TABLES: q(f"CREATE TABLE IF NOT EXISTS {t}(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT,data TEXT)")
    q("CREATE TABLE IF NOT EXISTS posted(id TEXT PRIMARY KEY,data TEXT)")           # faculty-assigned tasks
    q("CREATE TABLE IF NOT EXISTS progress(aid TEXT,sid TEXT,status TEXT,PRIMARY KEY(aid,sid))")  # student status per task

sig = lambda u: hmac.new(KEY, u.encode(), "sha256").hexdigest()
hp = lambda pw, salt: hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100000).hex()

class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)): body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def who(self):
        uid, _, s = self.headers.get("Authorization", "")[7:].partition(".")
        if not uid or not hmac.compare_digest(s, sig(uid)): return None
        r = q("SELECT id,name,email,role FROM accounts WHERE id=?", (uid,))
        return dict(zip(("id", "name", "email", "role"), r[0])) if r else None

    def auth(self, kind, d):
        d = d if isinstance(d, dict) else {}
        email, pw = str(d.get("email", "")).strip().lower(), str(d.get("password", ""))
        if "@" not in email or len(pw) < 4: return self.reply(400, {"error": "Valid email and 4+ character password required"})
        if kind == "register":
            name, role = str(d.get("name", "")).strip(), d.get("role", "student")
            if not name or role not in ("student", "faculty"): return self.reply(400, {"error": "Name and role required"})
            if role == "faculty" and d.get("code") != FACULTY_CODE: return self.reply(403, {"error": "Wrong faculty code"})
            uid, salt = secrets.token_hex(6), secrets.token_hex(8)
            try: q("INSERT INTO accounts VALUES(?,?,?,?,?,?)", (uid, name, email, role, salt, hp(pw, salt)))
            except sqlite3.IntegrityError: return self.reply(409, {"error": "Email already registered"})
        else:
            r = q("SELECT id,name,role,salt,pw FROM accounts WHERE email=?", (email,))
            if not r or not hmac.compare_digest(r[0][4], hp(pw, r[0][3])): return self.reply(401, {"error": "Wrong email or password"})
            uid, name, role = r[0][:3]
        self.reply(200, {"token": uid + "." + sig(uid), "user": {"id": uid, "name": name, "email": email, "role": role}})

    def api(self, m, p):
        try: d = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0) or 0)) or "null")
        except ValueError: return self.reply(400, {"error": "bad json"})
        r = p[1] if len(p) > 1 else ""
        if m == "POST" and r in ("register", "login"): return self.auth(r, d)
        u = self.who()
        if not u: return self.reply(401, {"error": "login required"})
        fac = u["role"] == "faculty"
        if r == "me": return self.reply(200, u)
        if r in TABLES:
            if m == "GET":
                return self.reply(200, [json.loads(x[0]) for x in q(f"SELECT data FROM {r} WHERE owner=? ORDER BY id", (u["id"],))])
            if m == "PUT" and isinstance(d, list):
                c = sqlite3.connect(DB); c.execute(f"DELETE FROM {r} WHERE owner=?", (u["id"],))
                c.executemany(f"INSERT INTO {r}(owner,data) VALUES(?,?)", [(u["id"], json.dumps(i)) for i in d]); c.commit(); c.close()
                return self.reply(200, {"saved": len(d)})
        studs = q("SELECT id,name FROM accounts WHERE role='student' ORDER BY name")
        if r == "students" and fac: return self.reply(200, [{"id": i, "name": n} for i, n in studs])
        if r == "posted" and m == "GET":
            rows = [{**json.loads(x[1]), "id": x[0]} for x in q("SELECT id,data FROM posted ORDER BY rowid DESC")]
            if not fac:
                st = dict(q("SELECT aid,status FROM progress WHERE sid=?", (u["id"],)))
                return self.reply(200, [{**x, "status": st.get(x["id"], "todo")} for x in rows if x["audience"] == "all" or u["id"] in x["audience"]])
            prog = {(a, s): t for a, s, t in q("SELECT aid,sid,status FROM progress")}
            out = []
            for x in rows:
                if x["faculty"] != u["id"]: continue
                x["students"] = [{"name": n, "status": prog.get((x["id"], i), "todo")} for i, n in studs if x["audience"] == "all" or i in x["audience"]]
                out.append(x)
            return self.reply(200, out)
        if r == "posted" and m == "POST" and fac and isinstance(d, dict):
            aud = d.get("audience", "all")
            if not str(d.get("title", "")).strip() or not d.get("due") or (aud != "all" and not isinstance(aud, list)):
                return self.reply(400, {"error": "title, due date and audience required"})
            rec = {"title": str(d["title"]).strip(), "subject": d.get("subject", ""), "desc": d.get("desc", ""), "due": d["due"],
                   "audience": aud, "faculty": u["id"], "faculty_name": u["name"]}
            q("INSERT INTO posted VALUES(?,?)", (secrets.token_hex(4), json.dumps(rec)))
            return self.reply(200, {"ok": 1})
        if r == "posted" and m == "DELETE" and fac and len(p) == 3:
            row = q("SELECT data FROM posted WHERE id=?", (p[2],))
            if row and json.loads(row[0][0])["faculty"] == u["id"]:
                q("DELETE FROM posted WHERE id=?", (p[2],)); q("DELETE FROM progress WHERE aid=?", (p[2],))
            return self.reply(200, {"ok": 1})
        if r == "progress" and m == "POST" and not fac and isinstance(d, dict) and d.get("status") in ("todo", "doing", "done"):
            q("INSERT OR REPLACE INTO progress VALUES(?,?,?)", (str(d.get("aid")), u["id"], d["status"]))
            return self.reply(200, {"ok": 1})
        self.reply(404, {"error": "not found"})

    def route(self, m):
        p = self.path.split("?")[0].strip("/").split("/")
        if p[0] == "api": return self.api(m, p)
        if m != "GET": return self.reply(405, {"error": "method not allowed"})
        f = os.path.realpath(os.path.join(WEB, "/".join(p) or "index.html"))
        if not f.startswith(WEB) or not os.path.isfile(f): return self.reply(404, b"Not found", "text/plain")
        with open(f, "rb") as fh: self.reply(200, fh.read(), TYPES.get(os.path.splitext(f)[1], "application/octet-stream"))

    do_GET = lambda self: self.route("GET")
    do_POST = lambda self: self.route("POST")
    do_PUT = lambda self: self.route("PUT")
    do_DELETE = lambda self: self.route("DELETE")
    def log_message(self, *a): pass

if __name__ == "__main__":
    init()
    print(f"Study Planner running at http://localhost:{PORT}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
