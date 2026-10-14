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
