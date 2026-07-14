"""Author analytics API routes."""

from fastapi import APIRouter, HTTPException, Query

from app.services.author_service import (
    get_author_rankings,
    get_author_statistics,
    get_author_topic_specialization,
)


router = APIRouter(
    prefix="/authors",
    tags=["Authors"],
)


@router.get("/rankings")
def author_rankings(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
) -> list[dict]:
    """Return authors ranked by publication activity."""

    try:
        return get_author_rankings(limit=limit)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve author rankings.",
        ) from exc


@router.get("/topics")
def author_topics(
    author_id: int | None = Query(
        default=None,
        ge=1,
    ),
) -> list[dict]:
    """Return author-topic specialization metrics."""

    try:
        return get_author_topic_specialization(author_id=author_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve author topic analytics.",
        ) from exc


@router.get("/statistics")
def author_statistics() -> dict:
    """Return overall author collaboration statistics."""

    try:
        result = get_author_statistics()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve author statistics.",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Author statistics are unavailable.",
        )

    return result
