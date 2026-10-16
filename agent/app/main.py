import asyncio
import contextlib
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.widgets import router as widgets_router
from app.services.cache import now_iso
from app.services.message_pipeline import refresh_mail
from app.services.school_notices import refresh_school_notices_if_stale

app = FastAPI(title="MyPage Agent")
REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"
FRONTEND_FAVICON = FRONTEND_DIST / "favicon.svg"
STARTED_AT = now_iso()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(widgets_router)

if (FRONTEND_DIST / "assets").exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="frontend-assets",
    )


if (FRONTEND_DIST / "wallpapers").exists():
    app.mount(
        "/wallpapers",
        StaticFiles(directory=FRONTEND_DIST / "wallpapers"),
        name="frontend-wallpapers",
    )


@app.get("/", response_model=None)
def frontend_index():
    if FRONTEND_INDEX.exists():
        return FileResponse(
            FRONTEND_INDEX,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    return HTMLResponse(
        """
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>MyPage needs a frontend build</title>
          </head>
          <body style="font-family: system-ui, sans-serif; padding: 32px;">
            <h1>MyPage frontend is not built yet.</h1>
            <p>Run <code>scripts\\build-extension.ps1</code> from the repo root.</p>
          </body>
        </html>
        """,
        status_code=503,
    )


@app.get("/favicon.svg", response_model=None)
def frontend_favicon():
    if FRONTEND_FAVICON.exists():
        return FileResponse(
            FRONTEND_FAVICON,
            media_type="image/svg+xml",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    return HTMLResponse("", status_code=404)


async def mail_sync_loop() -> None:
    interval = int(os.getenv("MAIL_SYNC_INTERVAL_SECONDS", "60"))

    if interval <= 0:
        return

    await asyncio.sleep(3)

    while True:
        try:
            await asyncio.to_thread(refresh_mail)
        except Exception as exc:
            # A transient failure must not permanently kill background receiving.
            print(f"[warn] mail sync failed: {type(exc).__name__}", file=sys.stderr)
        await asyncio.sleep(interval)


async def school_notice_startup_refresh() -> None:
    delay = int(os.getenv("SCHOOL_NOTICE_STARTUP_DELAY_SECONDS", "8"))
    ttl_seconds = int(os.getenv("SCHOOL_NOTICE_STARTUP_TTL_SECONDS", str(12 * 60 * 60)))

    if ttl_seconds <= 0:
        return

    await asyncio.sleep(max(0, delay))

    try:
        await asyncio.to_thread(refresh_school_notices_if_stale, ttl_seconds=ttl_seconds, days=2)
    except Exception as exc:
        print(f"[warn] school notices startup refresh failed: {exc}", file=sys.stderr)


@app.on_event("startup")
async def start_background_tasks() -> None:
    app.state.mail_sync_task = asyncio.create_task(mail_sync_loop())
    app.state.school_notice_startup_task = asyncio.create_task(school_notice_startup_refresh())


@app.on_event("shutdown")
async def stop_background_tasks() -> None:
    tasks = [
        getattr(app.state, "mail_sync_task", None),
        getattr(app.state, "school_notice_startup_task", None),
    ]

    for task in tasks:
        if not task:
            continue

        task.cancel()

        with contextlib.suppress(asyncio.CancelledError):
            await task


@app.get("/health")
def health() -> dict[str, bool | int | str]:
    return {
        "ok": True,
        "updatedAt": now_iso(),
        "startedAt": STARTED_AT,
        "pid": os.getpid(),
        "python": sys.executable,
        "repoRoot": str(REPO_ROOT),
        "dataDir": str(REPO_ROOT / "agent" / "app" / "data"),
    }
