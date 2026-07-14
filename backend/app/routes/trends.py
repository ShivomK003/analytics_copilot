"""Time-series analytics API routes."""

from fastapi import APIRouter, HTTPException

from app.services.trends_service import (
    get_cumulative_paper_counts,
    get_daily_paper_counts,
    get_monthly_paper_counts,
    get_weekly_paper_counts,
)


router = APIRouter(
    prefix="/trends",
    tags=["Trends"],
)


@router.get("/daily")
def daily_trends() -> list[dict]:
    """Return daily paper publication counts."""

    try:
        return get_daily_paper_counts()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve daily paper trends.",
        ) from exc


@router.get("/weekly")
def weekly_trends() -> list[dict]:
    """Return weekly paper publication counts."""

    try:
        return get_weekly_paper_counts()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve weekly paper trends.",
        ) from exc


@router.get("/monthly")
def monthly_trends() -> list[dict]:
    """Return monthly paper publication counts."""

    try:
        return get_monthly_paper_counts()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve monthly paper trends.",
        ) from exc


@router.get("/cumulative")
def cumulative_trends() -> list[dict]:
    """Return cumulative warehouse publication counts."""

    try:
        return get_cumulative_paper_counts()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve cumulative paper trends.",
        ) from exc
