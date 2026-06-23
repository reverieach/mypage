import asyncio
import contextlib
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.widgets import router as widgets_router
from app.services.cache import now_iso
from app.services.message_pipeline import refresh_mail

app = FastAPI(title="MyPage Agent")

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
