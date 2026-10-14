"""Additive Research Intelligence foundation routes."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.intelligence import CoverageResponse, TopicsResponse
from app.services.intelligence_service import get_coverage, get_topic_options
from app.services.research_filters import analytical_date_range

router = APIRouter(prefix="/intelligence", tags=["Research Intelligence"])


@router.get("/coverage", response_model=CoverageResponse)
def coverage() -> CoverageResponse:
    """Return whole-corpus coverage; database failures return a generic HTTP 500."""
    try:
        return get_coverage()
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Unable to retrieve research coverage."
        ) from exc


@router.get("/topics", response_model=TopicsResponse)
def topics(
    dates: Annotated[tuple[date | None, date | None], Depends(analytical_date_range)],
) -> TopicsResponse:
    """Return topic options for an optional inclusive UTC interval; invalid dates yield 422."""
    try:
        return get_topic_options(*dates)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Unable to retrieve research topics."
        ) from exc
