"""Topic analytics API routes."""

from fastapi import APIRouter, HTTPException

from app.services.topics_service import (
    get_topic_distribution,
    get_topic_growth_30d,
    get_topic_weekly_trends,
)


router = APIRouter(
    prefix="/topics",
    tags=["Topics"],
)


@router.get("/distribution")
def topic_distribution() -> list[dict]:
    """Return topic counts and percentages."""

    try:
        return get_topic_distribution()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve topic distribution.",
        ) from exc


@router.get("/weekly")
def topic_weekly_trends() -> list[dict]:
    """Return weekly trends by topic."""

    try:
        return get_topic_weekly_trends()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve weekly topic trends.",
        ) from exc


@router.get("/growth")
def topic_growth() -> list[dict]:
    """Return latest 30-day topic growth."""

    try:
        return get_topic_growth_30d()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve topic growth.",
        ) from exc
