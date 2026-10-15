"""Private, single-household relay. Run ONE worker behind HTTPS; never run the Agent here."""
import argparse
import asyncio
import contextlib
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("SHARE_DATA_DIR", str(Path.home() / ".mypage-relay")))
MAX_FILE = 200 * 1024 * 1024
STORAGE_LIMIT = int(os.environ.get("SHARE_STORAGE_BYTES", str(2 * 1024**3)))
EGRESS_LIMIT = int(os.environ.get("SHARE_MONTHLY_BYTES", str(15 * 1024**3)))
RETENTION = 24 * 3600
TOKEN_DAYS = 90
PEERS: dict[str, WebSocket] = {}
UPLOADS: set[str] = set()
ATTEMPTS: dict[str, tuple[int, float]] = {}


def db():
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    connection = sqlite3.connect(DATA / "relay.sqlite3", timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def init():
    with db() as c:
        c.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE,
            expires REAL NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL,
            kind TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
            size INTEGER NOT NULL, digest TEXT NOT NULL DEFAULT '', ready INTEGER NOT NULL DEFAULT 0,
            created REAL NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS usage (month TEXT PRIMARY KEY, bytes INTEGER NOT NULL);
        """)


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def authenticate(token: str):
    with db() as c:
        row = c.execute("SELECT * FROM devices WHERE hash=? AND expires>?", (digest(token), time.time())).fetchone()
    if not row:
        raise HTTPException(401, "配对已失效，请重新配对")
    return dict(row)


def who(request: Request):
    header = request.headers.get("authorization", "")
    return authenticate(header[7:] if header.startswith("Bearer ") else "")


async def body(request: Request, limit=65536):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(413, "请求过大")
    try:
        value = json.loads(data)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "无效请求")


def invite():
    code = secrets.token_hex(8)
    with db() as c:
        c.execute("DELETE FROM invites WHERE expires<?", (time.time(),))
        c.execute("INSERT INTO invites VALUES (?,?)", (digest(code), time.time() + 600))
    return {"code": code, "expiresIn": 600}


def cleanup():
    with db() as c:
        rows = c.execute("SELECT id FROM items WHERE expires<?", (time.time(),)).fetchall()
        for row in rows:
            if row["id"] not in UPLOADS:
                (DATA / row["id"]).unlink(missing_ok=True)
                c.execute("DELETE FROM items WHERE id=?", (row["id"],))
        c.execute("DELETE FROM invites WHERE expires<?", (time.time(),))


async def janitor():
    while True:
        cleanup()
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app):
    init()
    # An interrupted upload can be retried using the same transfer id.
    with db() as c:
        for row in c.execute("SELECT id FROM items WHERE ready=0"):
            (DATA / row["id"]).unlink(missing_ok=True)
    task = asyncio.create_task(janitor())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="MyPage Share", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; "
        "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; "
        "frame-ancestors 'self' chrome-extension: http://127.0.0.1:3217 http://localhost:5173 http://127.0.0.1:5173"
    )
    return response


@app.get("/")
@app.get("/share")
def page():
    return FileResponse(ROOT / "web" / "index.html", media_type="text/html")


@app.get("/app.js")
def javascript():
    return FileResponse(ROOT / "web" / "app.js", media_type="text/javascript")


@app.get("/style.css")
def stylesheet():
    return FileResponse(ROOT / "web" / "style.css", media_type="text/css")


@app.get("/health")
def health():
    return {"ok": True, "service": "mypage-share", "version": 1}


@app.post("/api/pair")
async def pair(request: Request):
    address = request.client.host if request.client else "unknown"
    now = time.time()
    # Also rate-limited by nginx using the real peer IP; never trust arbitrary X-Forwarded-For.
    count, until = ATTEMPTS.get(address, (0, now + 60))
    if until < now:
        count, until = 0, now + 60
    if count >= 10:
        raise HTTPException(429, "尝试太频繁，请稍后重试")
    if len(ATTEMPTS) > 4096:
        ATTEMPTS.clear()
    ATTEMPTS[address] = (count + 1, until)
    value = await body(request, 2048)
    code = str(value.get("code", "")).strip().lower().replace("-", "")
    name = str(value.get("name", "")).strip()[:40]
    if not name:
        raise HTTPException(400, "请输入设备名称")
    token, device_id = secrets.token_urlsafe(32), str(uuid.uuid4())
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT * FROM invites WHERE hash=? AND expires>?", (digest(code), now)).fetchone()
        if not row:
            raise HTTPException(401, "配对码无效、过期或已使用")
        if c.execute("SELECT count(*) FROM devices WHERE expires>?", (now,)).fetchone()[0] >= 20:
            raise HTTPException(409, "设备数量已达上限，请移除旧设备")
        c.execute("DELETE FROM invites WHERE hash=?", (digest(code),))
        c.execute("INSERT INTO devices VALUES (?,?,?,?,?)", (device_id, name, digest(token), now + TOKEN_DAYS * 86400, now))
    return {"id": device_id, "name": name, "token": token}


@app.get("/api/devices")
def devices(request: Request):
    me = who(request)
    with db() as c:
        rows = c.execute("SELECT id,name FROM devices WHERE expires>? ORDER BY created", (time.time(),)).fetchall()
        month = time.strftime("%Y-%m", time.gmtime(time.time() + 8 * 3600))
        row = c.execute("SELECT bytes FROM usage WHERE month=?", (month,)).fetchone()
    return {"self": me["id"], "devices": [{**dict(row), "online": row["id"] in PEERS} for row in rows],
            "usage": row[0] if row else 0, "budget": EGRESS_LIMIT, "maxFile": MAX_FILE}


@app.post("/api/invite")
def new_invite(request: Request):
    who(request)
    with db() as c:
        if c.execute("SELECT count(*) FROM invites WHERE expires>?", (time.time(),)).fetchone()[0] >= 5:
            raise HTTPException(429, "已有未使用配对码，请稍后再生成")
    return invite()


@app.delete("/api/device")
async def forget(request: Request):
    me = who(request)
    with db() as c:
        c.execute("DELETE FROM devices WHERE id=?", (me["id"],))
    peer = PEERS.get(me["id"])
    if peer:
        await peer.close(code=1000)
    return {"ok": True}


def item_record(item_id, device_id):
    with db() as c:
        row = c.execute("SELECT * FROM items WHERE id=? AND expires>?", (item_id, time.time())).fetchone()
    if not row or device_id not in (row["sender"], row["recipient"]):
        raise HTTPException(404, "内容不存在或已过期")
    return dict(row)


@app.get("/api/items")
def items(request: Request):
    me = who(request)
    with db() as c:
        rows = c.execute("SELECT * FROM items WHERE ready=1 AND expires>? AND (sender=? OR recipient=?) ORDER BY created DESC LIMIT 100",
                         (time.time(), me["id"], me["id"])).fetchall()
    return {"items": [dict(row) for row in rows]}


@app.post("/api/items")
async def begin(request: Request):
    me, value = who(request), await body(request)
    try:
        item_id = str(uuid.UUID(str(value.get("id", ""))))
        size = int(value.get("size", 0))
    except (ValueError, TypeError):
        raise HTTPException(400, "无效文件信息")
    recipient = str(value.get("recipient", ""))
    kind = str(value.get("kind", ""))
    text = str(value.get("text", ""))
    name = str(value.get("name", "文件")).replace("\\", "/").split("/")[-1][:180] or "文件"
    name = "".join(ch for ch in name if ord(ch) >= 32)
    if kind not in ("text", "file") or size < 0 or size > MAX_FILE or len(text.encode()) > 16384:
        raise HTTPException(413, "文件最大 200 MiB，文字最大 16 KiB")
    if kind == "text":
        size = len(text.encode())
    cleanup()
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        if not c.execute("SELECT 1 FROM devices WHERE id=? AND expires>?", (recipient, time.time())).fetchone():
            raise HTTPException(400, "请选择已配对的接收设备")
        previous = c.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        if previous:
            if previous["sender"] != me["id"] or previous["recipient"] != recipient or previous["size"] != size or previous["kind"] != kind:
                raise HTTPException(409, "传输编号冲突")
            return dict(previous)
        total = c.execute("SELECT coalesce(sum(size),0),count(*) FROM items").fetchone()
        if total[0] + size > STORAGE_LIMIT or total[1] >= 1000:
            raise HTTPException(507, "云端暂存空间已满，请删除内容或等待过期")
        c.execute("INSERT INTO items (id,sender,recipient,kind,name,text,size,ready,created,expires) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (item_id, me["id"], recipient, kind, name, text if kind == "text" else "", size, int(kind == "text"), time.time(), time.time() + RETENTION))
    return item_record(item_id, me["id"])


@app.put("/api/items/{item_id}/file")
async def upload(item_id: str, request: Request):
    me = who(request)
    row = item_record(item_id, me["id"])
    if row["sender"] != me["id"] or row["kind"] != "file":
        raise HTTPException(403, "不能上传此内容")
    if row["ready"]:
        return row
    if item_id in UPLOADS:
        raise HTTPException(409, "文件正在上传")
    UPLOADS.add(item_id)
    path = DATA / row["id"]
    size, hasher = 0, hashlib.sha256()
    try:
        with path.open("wb") as output:
            async for chunk in request.stream():
                size += len(chunk)
                if size > row["size"]:
                    raise HTTPException(413, "上传大小超出声明")
                output.write(chunk)
                hasher.update(chunk)
        if size != row["size"]:
            raise HTTPException(400, "文件上传不完整，请重试")
        with db() as c:
            c.execute("UPDATE items SET ready=1,digest=? WHERE id=?", (hasher.hexdigest(), item_id))
        return item_record(item_id, me["id"])
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    finally:
        UPLOADS.discard(item_id)


@app.get("/api/items/{item_id}/file")
def download(item_id: str, request: Request):
    me = who(request)
    row = item_record(item_id, me["id"])
    if not row["ready"] or row["kind"] != "file":
        raise HTTPException(404, "文件尚未上传完成")
    # Reserve the entire download before sending, including retries/aborted requests.
    month = time.strftime("%Y-%m", time.gmtime(time.time() + 8 * 3600))
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute("INSERT OR IGNORE INTO usage VALUES (?,0)", (month,))
        used = c.execute("SELECT bytes FROM usage WHERE month=?", (month,)).fetchone()[0]
        if used + row["size"] > EGRESS_LIMIT:
            raise HTTPException(429, "本服务本月下载预算已用完，仍可直连")
        c.execute("UPDATE usage SET bytes=bytes+? WHERE month=?", (row["size"], month))
    # Full authenticated attachment only. No bearer credentials in a URL or access log.
    return FileResponse(DATA / row["id"], filename=row["name"], media_type="application/octet-stream",
                        headers={"X-File-SHA256": row["digest"]})


@app.delete("/api/items/{item_id}")
def remove(item_id: str, request: Request):
    row = item_record(item_id, who(request)["id"])
    if item_id in UPLOADS:
        raise HTTPException(409, "请等待上传完成")
    with db() as c:
        c.execute("DELETE FROM items WHERE id=?", (row["id"],))
    (DATA / row["id"]).unlink(missing_ok=True)
    return {"ok": True}


@app.websocket("/ws")
async def signal(ws: WebSocket):
    # Origin check protects browser connections; credentials are still required independently.
    origin = ws.headers.get("origin", "")
    expected = os.environ.get("SHARE_ORIGIN", "https://share.reverieach.com")
    if origin not in expected.split(","):
        await ws.close(code=1008)
        return
    await ws.accept()
    device_id = None
    try:
        first = await asyncio.wait_for(ws.receive_text(), 10)
        if len(first) > 2048:
            raise ValueError()
        token = json.loads(first).get("token", "")
        me = authenticate(token)
        device_id = me["id"]
        old = PEERS.get(device_id)
        if old:
            await old.close(code=4001)
        PEERS[device_id] = ws
        await ws.send_json({"type": "ready", "id": device_id})
        window, count = time.monotonic(), 0
        while True:
            raw = await asyncio.wait_for(ws.receive_text(), 45)
            authenticate(token)
            if time.monotonic() - window > 60:
                window, count = time.monotonic(), 0
            count += 1
            if len(raw) > 65536 or count > 120:
                raise ValueError()
            value = json.loads(raw)
            if value.get("type") == "ping":
                await ws.send_json({"type": "pong"})
            elif value.get("type") in ("offer", "answer", "reject"):
                target = PEERS.get(str(value.get("to")))
                if target and target is not ws:
                    await target.send_json({"type": value["type"], "from": device_id,
                                            "session": str(value.get("session", ""))[:80], "sdp": str(value.get("sdp", ""))[:60000]})
    except (WebSocketDisconnect, asyncio.TimeoutError, HTTPException, ValueError, TypeError, AttributeError, RuntimeError):
        pass
    finally:
        if device_id and PEERS.get(device_id) is ws:
            PEERS.pop(device_id, None)
        with contextlib.suppress(RuntimeError):
            await ws.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["invite", "devices", "revoke"])
    parser.add_argument("device_id", nargs="?")
    args = parser.parse_args()
    init()
    if args.command == "invite":
        print(json.dumps(invite()))
    elif args.command == "devices":
        with db() as c:
            print(json.dumps([dict(row) for row in c.execute("SELECT id,name,expires FROM devices")], ensure_ascii=False))
    elif args.device_id:
        with db() as c:
            c.execute("DELETE FROM devices WHERE id=?", (args.device_id,))
