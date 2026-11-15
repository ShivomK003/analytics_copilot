"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.db import close_connection_pool
from app.errors import DatabasePoolTimeout
from app.routes.authors import router as authors_router
from app.routes.categories import router as categories_router
from app.routes.dashboard import router as dashboard_router
from app.routes.health import router as health_router
from app.routes.intelligence import router as intelligence_router
from app.routes.metrics import router as metrics_router
from app.routes.papers import router as paper_router
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


@app.exception_handler(DatabasePoolTimeout)
async def pool_timeout_handler(request: Request, exc: DatabasePoolTimeout) -> JSONResponse:
    """Expose exhausted capacity as temporary unavailability without internals."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Database is temporarily busy. Please retry."},
        headers={"Retry-After": "1"},
    )


@app.exception_handler(HTTPException)
async def database_http_exception_handler(request: Request, exc: HTTPException) -> Response:
    """Preserve existing HTTP errors, including routes wrapping capacity timeouts.

    Legacy and intelligence routes chain database failures into HTTPException;
    recognize that cause without changing their successful contracts or SQL.
    """
    if isinstance(exc.__cause__, DatabasePoolTimeout):
        return await pool_timeout_handler(request, exc.__cause__)
    return await http_exception_handler(request, exc)


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
app.include_router(paper_router)
app.include_router(intelligence_router)


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
