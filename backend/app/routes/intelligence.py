"""Additive Research Intelligence foundation routes."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.intelligence import (
    CoverageResponse,
    TopicsResponse,
    MomentumResponse,
    MomentumMatrixResponse,
    RelationshipsResponse,
    TopicCategoryHeatmapResponse,
)
from app.services.intelligence_service import (
    AnalyticalWindowError,
    get_coverage,
    get_topic_options,
    get_momentum,
    get_momentum_matrix,
    get_relationships,
    get_topic_category_heatmap,
)
from app.services.research_filters import analytical_date_range, analytical_topic_ids

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


@router.get("/momentum", response_model=MomentumResponse)
def momentum(
    dates: Annotated[tuple[date | None, date | None], Depends(analytical_date_range)],
    topic_ids: Annotated[list[int], Depends(analytical_topic_ids)],
    mode: Literal["count", "index"] = "count",
    include_partial_weeks: bool = True,
) -> MomentumResponse:
    """Return weekly activity; invalid reporting windows return 422, SQL failures 500."""
    try:
        return get_momentum(*dates, topic_ids, mode, include_partial_weeks)
    except AnalyticalWindowError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Unable to retrieve research momentum."
        ) from exc


@router.get("/momentum-matrix", response_model=MomentumMatrixResponse)
def momentum_matrix(
    dates: Annotated[tuple[date | None, date | None], Depends(analytical_date_range)],
    topic_ids: Annotated[list[int], Depends(analytical_topic_ids)],
    window_weeks: Annotated[int, Query(ge=2, le=12)] = 4,
) -> MomentumMatrixResponse:
    """Return comparable full-week activity; insufficient history returns HTTP 422."""
    try:
        return get_momentum_matrix(*dates, topic_ids, window_weeks)
    except AnalyticalWindowError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Unable to retrieve research momentum matrix."
        ) from exc


@router.get("/relationships", response_model=RelationshipsResponse)
def relationships(
    dates: Annotated[tuple[date | None, date | None], Depends(analytical_date_range)],
    topic_ids: Annotated[list[int], Depends(analytical_topic_ids)],
    min_shared_papers: Annotated[int, Query(ge=1)] = 1,
) -> RelationshipsResponse:
    """Return topic associations; invalid parameters yield 422 and SQL failures generic 500."""
    try:
        return get_relationships(*dates, topic_ids, min_shared_papers)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Unable to retrieve research relationships."
        ) from exc


@router.get("/topic-category-heatmap", response_model=TopicCategoryHeatmapResponse)
def topic_category_heatmap(
    dates: Annotated[tuple[date | None, date | None], Depends(analytical_date_range)],
    topic_ids: Annotated[list[int], Depends(analytical_topic_ids)],
    category_scope: Literal["all", "primary"] = "all",
) -> TopicCategoryHeatmapResponse:
    """Return topic/category intersections with all or primary category interpretation."""
    try:
        return get_topic_category_heatmap(*dates, topic_ids, category_scope)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Unable to retrieve topic-category heatmap."
        ) from exc
