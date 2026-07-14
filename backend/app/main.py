from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.health import router as health_router
from app.routes.metrics import router as metrics_router


app = FastAPI(
    title="AI Research Intelligence Copilot",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(metrics_router)


@app.get("/")
def root() -> dict[str, str]:
    """Return basic API information."""

    return {
        "message": "AI Research Intelligence Copilot API",
        "docs": "/docs",
        "health": "/health",
        "metrics": "/metrics",
    }
