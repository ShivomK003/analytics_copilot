"""Paper discovery API routes."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.paper_service import (
    count_papers,
    get_paper_authors,
    get_paper_by_id,
    get_related_papers,
    search_papers,
)

router = APIRouter(
    prefix="/papers",
    tags=["Papers"],
)


@router.get("/search")
def paper_search(
    query: str | None = Query(
        default=None,
        min_length=1,
        max_length=200,
    ),
    topic: str | None = Query(
        default=None,
        min_length=1,
        max_length=50,
    ),
    category: str | None = Query(
        default=None,
        min_length=1,
        max_length=50,
    ),
    date_from: date | None = None,
    date_to: date | None = None,
    sort: Literal["newest", "oldest", "relevance"] = "newest",
    limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
) -> list[dict]:
    """Search papers using keywords and research filters."""

    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="date_from cannot be later than date_to.",
        )

    try:
        return search_papers(
            query=query,
            topic=topic,
            category=category,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
            limit=limit,
            offset=offset,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to search papers.",
        ) from exc


@router.get("/count")
def paper_count(
    query: str | None = Query(
        default=None,
        min_length=1,
        max_length=200,
    ),
    topic: str | None = Query(
        default=None,
        min_length=1,
        max_length=50,
    ),
    category: str | None = Query(
        default=None,
        min_length=1,
        max_length=50,
    ),
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Count papers matching the selected filters."""

    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="date_from cannot be later than date_to.",
        )

    try:
        return {
            "total": count_papers(
                query=query,
                topic=topic,
                category=category,
                date_from=date_from,
                date_to=date_to,
            )
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to count matching papers.",
        ) from exc


@router.get("/{paper_id}/authors")
def paper_authors(paper_id: str) -> list[dict]:
    """Return researchers associated with a paper."""

    try:
        return get_paper_authors(paper_id)

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve paper authors.",
        ) from exc


@router.get("/{paper_id}/related")
def related_papers(
    paper_id: str,
    limit: int = Query(
        default=10,
        ge=1,
        le=50,
    ),
) -> list[dict]:
    """Return papers related through shared research topics."""

    try:
        return get_related_papers(
            paper_id=paper_id,
            limit=limit,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve related papers.",
        ) from exc


@router.get("/{paper_id}")
def paper_detail(paper_id: str) -> dict:
    """Return complete details for a paper."""

    try:
        paper = get_paper_by_id(paper_id)

        if paper is None:
            raise HTTPException(
                status_code=404,
                detail="Paper not found.",
            )

        return paper

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve paper details.",
        ) from exc