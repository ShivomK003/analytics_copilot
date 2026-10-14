"""Research Intelligence foundation response contracts."""

from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, Field, model_validator

Count = Annotated[int, Field(ge=0)]


class IntelligenceMetadata(BaseModel):
    """Observed corpus bounds are not evidence of continuous historical coverage."""

    date_from: date | None = None
    date_to: date | None = None
    timezone: Literal["UTC"] = "UTC"
    observed_date_from: date | None = None
    observed_date_to: date | None = None
    coverage_status: Literal["unknown"] = "unknown"
    warnings: list[str] = Field(default_factory=list)


class CoverageData(BaseModel):
    """Lifetime stored-ID counts, independent of analytical date selection."""

    total_indexed_papers: Count
    dated_papers: Count
    undated_papers: Count
    tagged_papers: Count
    untagged_papers: Count
    total_topics: Count
    observed_date_from: date | None
    observed_date_to: date | None
    latest_successful_etl_at: AwareDatetime | None

    @model_validator(mode="after")
    def reconcile_counts(self) -> "CoverageData":
        """Reject inconsistent partitions rather than publish misleading counts."""
        if self.dated_papers + self.undated_papers != self.total_indexed_papers:
            raise ValueError("Dated and undated counts must reconcile with the total.")
        if self.tagged_papers + self.untagged_papers != self.total_indexed_papers:
            raise ValueError("Tagged and untagged counts must reconcile with the total.")
        return self


class TopicOption(BaseModel):
    """One configured topic, including topics with no associated publications."""

    topic_id: Annotated[int, Field(gt=0)]
    topic_name: str
    period_paper_count: Count
    total_indexed_paper_count: Count


class CoverageResponse(BaseModel):
    """Coverage endpoint envelope."""

    meta: IntelligenceMetadata
    data: CoverageData


class TopicsResponse(BaseModel):
    """Topic options endpoint envelope."""

    meta: IntelligenceMetadata
    data: list[TopicOption]


class ReportingInterval(BaseModel):
    """Resolved inclusive UTC dates; unresolved empty-corpus sides remain null."""

    date_from: date | None
    date_to: date | None


class MomentumPoint(BaseModel):
    """One UTC topic/week bucket with explicit clipping and a nullable index."""

    week_start: date
    week_end_exclusive: date
    effective_start: AwareDatetime
    effective_end_exclusive: AwareDatetime
    paper_count: Count
    index_value: float | None
    is_partial_week: bool


class MomentumTopic(BaseModel):
    """A configured topic and its zero-filled weekly observations."""

    topic_id: Annotated[int, Field(gt=0)]
    topic_name: str
    baseline_week_start: date | None
    baseline_count: Count | None
    points: list[MomentumPoint]


class MomentumData(BaseModel):
    """Finite weekly dataset; baseline fields are populated only in index mode."""

    mode: Literal["count", "index"]
    interval: ReportingInterval
    topics: list[MomentumTopic]


class MomentumResponse(BaseModel):
    """Research Momentum response envelope."""

    meta: IntelligenceMetadata
    data: MomentumData


class ComparisonWindow(BaseModel):
    """A half-open UTC interval containing only complete calendar weeks."""

    start: AwareDatetime
    end_exclusive: AwareDatetime


class MomentumMatrixTopic(TopicOption):
    """Comparable-window counts and descriptive growth, independent of impact."""

    previous_paper_count: Count
    recent_paper_count: Count
    absolute_change: int
    growth_percent: float | None
    growth_state: Literal["growing", "declining", "stable", "no_baseline"]
    low_baseline: bool


class MomentumMatrixData(BaseModel):
    """Comparison boundaries are null when an empty corpus cannot resolve dates."""

    window_weeks: Annotated[int, Field(ge=2, le=12)]
    interval: ReportingInterval
    previous_window: ComparisonWindow | None
    recent_window: ComparisonWindow | None
    topics: list[MomentumMatrixTopic]


class MomentumMatrixResponse(BaseModel):
    """Research Momentum Matrix response envelope."""

    meta: IntelligenceMetadata
    data: MomentumMatrixData


class AssociationTopic(BaseModel):
    """Selected topic with its full date-filtered distinct-paper total."""

    topic_id: Annotated[int, Field(gt=0)]
    topic_name: str
    paper_count: Count


class RelationshipEdge(BaseModel):
    """One canonical unordered topic pair; similarity is a fraction, not a percentage."""

    topic_a_id: Annotated[int, Field(gt=0)]
    topic_b_id: Annotated[int, Field(gt=0)]
    shared_paper_count: Annotated[int, Field(ge=1)]
    jaccard_similarity: Annotated[float, Field(ge=0, le=1)] | None


class RelationshipsData(BaseModel):
    """Thresholded edges and unthresholded nodes for an optional UTC interval."""

    date_from: date | None
    date_to: date | None
    min_shared_papers: Annotated[int, Field(ge=1)]
    nodes: list[AssociationTopic]
    edges: list[RelationshipEdge]


class RelationshipsResponse(BaseModel):
    """Research Relationships response envelope."""

    meta: IntelligenceMetadata
    data: RelationshipsData


class HeatmapCategory(BaseModel):
    """Category denominator includes every matching paper regardless of topic selection."""

    category_id: Annotated[int, Field(gt=0)]
    category_code: str
    paper_count: Count


class HeatmapCell(BaseModel):
    """One selected topic/category intersection, including explicit zero cells."""

    topic_id: Annotated[int, Field(gt=0)]
    category_id: Annotated[int, Field(gt=0)]
    paper_count: Count
    category_prevalence_pct: Annotated[float, Field(ge=0, le=100)] | None
    topic_distribution_pct: Annotated[float, Field(ge=0, le=100)] | None


class TopicCategoryHeatmapData(BaseModel):
    """Complete selected-topic by active-category matrix under one category scope."""

    date_from: date | None
    date_to: date | None
    category_scope: Literal["all", "primary"]
    topics: list[AssociationTopic]
    categories: list[HeatmapCategory]
    cells: list[HeatmapCell]


class TopicCategoryHeatmapResponse(BaseModel):
    """Topic–Category Heatmap response envelope."""

    meta: IntelligenceMetadata
    data: TopicCategoryHeatmapData
