"""Category analytics API routes."""

from fastapi import APIRouter, HTTPException

from app.services.category_service import (
    get_category_distribution,
    get_category_growth_30d,
    get_category_topic_matrix,
    get_category_weekly_trends,
    get_primary_category_distribution,
)


router = APIRouter(
    prefix="/categories",
    tags=["Categories"],
)


@router.get("/distribution")
def category_distribution() -> list[dict]:
    """Return distribution across all category associations."""

    try:
        return get_category_distribution()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve category distribution.",
        ) from exc


@router.get("/primary-distribution")
def primary_category_distribution() -> list[dict]:
    """Return distribution by primary arXiv category."""

    try:
        return get_primary_category_distribution()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve primary-category distribution.",
        ) from exc


@router.get("/weekly")
def category_weekly_trends() -> list[dict]:
    """Return weekly category trends."""

    try:
        return get_category_weekly_trends()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve weekly category trends.",
        ) from exc


@router.get("/growth")
def category_growth() -> list[dict]:
    """Return category growth over two 30-day periods."""

    try:
        return get_category_growth_30d()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve category growth.",
        ) from exc


@router.get("/topic-matrix")
def category_topic_matrix() -> list[dict]:
    """Return category-topic shared-paper counts."""

    try:
        return get_category_topic_matrix()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve category-topic matrix.",
        ) from exc
