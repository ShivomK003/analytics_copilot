"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import close_connection_pool
from app.routes.authors import router as authors_router
from app.routes.categories import router as categories_router
from app.routes.dashboard import router as dashboard_router
from app.routes.health import router as health_router
from app.routes.metrics import router as metrics_router
from app.routes.topics import router as topics_router
from app.routes.trends import router as trends_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Manage application startup and shutdown resources.

    Code before yield runs during startup.
    Code after yield runs during shutdown.
    """

    yield

    close_connection_pool()


app = FastAPI(
    title="AI Research Intelligence Copilot",
    version="0.1.0",
    lifespan=lifespan,
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
app.include_router(trends_router)
app.include_router(topics_router)
app.include_router(categories_router)
app.include_router(authors_router)
app.include_router(dashboard_router)


@app.get("/")
def root() -> dict[str, str]:
    """Return basic API information."""

    return {
        "message": "AI Research Intelligence Copilot API",
        "docs": "/docs",
        "health": "/health",
        "metrics": "/metrics",
        "trends": "/trends/daily",
        "topics": "/topics/distribution",
        "categories": "/categories/distribution",
        "authors": "/authors/rankings",
        "dashboard_home": "/dashboard/home",
    }
