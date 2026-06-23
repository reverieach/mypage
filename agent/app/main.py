from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.widgets import router as widgets_router
from app.services.cache import now_iso

app = FastAPI(title="MyPage Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(widgets_router)


@app.get("/health")
def health() -> dict[str, bool | str]:
    return {"ok": True, "updatedAt": now_iso()}
