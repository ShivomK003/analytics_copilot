"""Dashboard-ready API routes."""

from fastapi import APIRouter, HTTPException, Query

from app.services.dashboard_service import (
    get_dashboard_home,
    get_dashboard_kpis,
    get_latest_papers,
)


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


@router.get("/kpis")
def dashboard_kpis() -> dict:
    """Return the dashboard KPI summary."""

    try:
        result = get_dashboard_kpis()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve dashboard KPIs.",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Dashboard KPIs are unavailable.",
        )

    return result


@router.get("/latest-papers")
def latest_papers(
    limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
) -> list[dict]:
    """Return the latest papers for the dashboard feed."""

    try:
        return get_latest_papers(limit=limit)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve latest papers.",
        ) from exc


@router.get("/home")
def dashboard_home(
    latest_paper_limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
    author_limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
) -> dict:
    """Return all datasets required by the dashboard homepage."""

    try:
        return get_dashboard_home(
            latest_paper_limit=latest_paper_limit,
            author_limit=author_limit,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve dashboard homepage data.",
        ) from exc
