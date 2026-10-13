"""Author analytics API routes."""

from fastapi import APIRouter, HTTPException, Query

from app.services.author_service import (
    count_authors,
    get_author_by_id,
    get_author_papers,
    get_author_rankings,
    get_author_statistics,
    get_author_topic_specialization,
    search_authors,
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


@router.get("/search")
def author_search(
    query: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
    ),
    topic: str | None = Query(
        default=None,
        min_length=1,
        max_length=50,
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
) -> list[dict]:
    """Search authors by name and research topic."""

    try:
        return search_authors(
            query=query,
            topic=topic,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to search authors.",
        ) from exc



@router.get("/{author_id}/papers")
def author_papers(
    author_id: int,
    topic: str | None = Query(
        default=None,
        min_length=1,
        max_length=50,
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
) -> list[dict]:
    """Return an author's papers, optionally filtered by research topic."""

    try:
        return get_author_papers(
            author_id=author_id,
            topic=topic,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve author publications.",
        ) from exc


@router.get("/count")
def author_count(
    query: str | None = Query(default=None, min_length=1, max_length=100),
    topic: str | None = Query(default=None, min_length=1, max_length=50),
) -> dict:
    try:
        return {"total": count_authors(query=query, topic=topic)}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve author count.",
        ) from exc

@router.get("/{author_id}")
def author_detail(author_id: int):
    try:
        author = get_author_by_id(author_id)

        if author is None:
            raise HTTPException(
                status_code=404,
                detail="Researcher not found.",
            )

        return author

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve researcher details.",
        ) from exc