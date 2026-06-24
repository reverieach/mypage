import asyncio
import contextlib
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.widgets import router as widgets_router
from app.services.cache import now_iso
from app.services.message_pipeline import refresh_mail

app = FastAPI(title="MyPage Agent")
REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

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
        return FileResponse(FRONTEND_INDEX)

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


async def mail_sync_loop() -> None:
    interval = int(os.getenv("MAIL_SYNC_INTERVAL_SECONDS", "900"))

    if interval <= 0:
        return

    await asyncio.sleep(3)

    while True:
        await asyncio.to_thread(refresh_mail)
        await asyncio.sleep(interval)


@app.on_event("startup")
async def start_background_tasks() -> None:
    app.state.mail_sync_task = asyncio.create_task(mail_sync_loop())


@app.on_event("shutdown")
async def stop_background_tasks() -> None:
    task = getattr(app.state, "mail_sync_task", None)

    if task:
        task.cancel()

        with contextlib.suppress(asyncio.CancelledError):
            await task


@app.get("/health")
def health() -> dict[str, bool | str]:
    return {"ok": True, "updatedAt": now_iso()}
