"""Read-only corpus coverage and topic options; no historical completeness inference."""

from datetime import date, datetime, timezone

from app.db import fetch_all, fetch_one
from app.schemas.intelligence import (
    CoverageData,
    CoverageResponse,
    IntelligenceMetadata,
    TopicOption,
    TopicsResponse,
)
from app.services.research_filters import publication_date_predicate

COVERAGE_WARNING = "Historical ingestion completeness has not been verified."
TOPIC_WARNING = (
    "Topic assignments are automatically detected and may contain classification noise."
)


def _latest_successful_etl() -> tuple[datetime | None, list[str]]:
    """Resolve expected ETL column types before querying completed SUCCESS runs.

    Missing/incompatible metadata returns a warning. Permissions, connectivity and
    other query failures propagate; they must not look like successful coverage.
    """
    columns = fetch_all(
        """
        select attname as column_name, atttypid::regtype::text as data_type
        from pg_attribute
        where attrelid = to_regclass('etl_runs')
          and attnum > 0 and not attisdropped;
        """
    )
    types = {row["column_name"]: row["data_type"] for row in columns}
    if (
        types.get("status") not in {"text", "character varying", "character"}
        or types.get("end_time") != "timestamp with time zone"
    ):
        return None, ["ETL freshness metadata is unavailable or has an unsupported schema."]
    row = fetch_one(
        """
        select max(end_time) as latest_successful_etl_at
        from etl_runs
        where status = %s and end_time is not null;
        """,
        ("SUCCESS",),
    )
    timestamp = row["latest_successful_etl_at"] if row else None
    if timestamp is None:
        return None, ["No completed successful ETL execution is recorded."]
    return timestamp.astimezone(timezone.utc), []


def _metadata(
    row: dict,
    date_from: date | None = None,
    date_to: date | None = None,
    extra_warnings: list[str] | None = None,
) -> IntelligenceMetadata:
    """Describe actual whole-corpus bounds without inventing verified coverage."""
    warnings = [COVERAGE_WARNING, TOPIC_WARNING]
    if row["undated_papers"]:
        warnings.append(
            "Some indexed publications have missing publication dates and are "
            "excluded from date-based analytics."
        )
    return IntelligenceMetadata(
        date_from=date_from,
        date_to=date_to,
        observed_date_from=row["observed_date_from"],
        observed_date_to=row["observed_date_to"],
        warnings=warnings + (extra_warnings or []),
    )


def get_coverage() -> CoverageResponse:
    """Return lifetime stored-ID partitions and optional successful ETL freshness.

    SQL failures propagate to the route's generic server error response.
    """
    row = fetch_one(
        """
        -- Grain: one row for the entire indexed corpus. fact_papers has a unique
        -- paper_id; EXISTS avoids multiplying a paper with overlapping tags.
        select
            count(*) as total_indexed_papers,
            count(*) filter (where p.published_date is not null) as dated_papers,
            count(*) filter (where p.published_date is null) as undated_papers,
            count(*) filter (where exists (
                select 1 from paper_topics pt where pt.paper_id = p.paper_id
            )) as tagged_papers,
            (select count(*) from dim_topic) as total_topics,
            (min(p.published_date) at time zone 'UTC')::date as observed_date_from,
            (max(p.published_date) at time zone 'UTC')::date as observed_date_to
        from fact_papers p;
        """
    )
    if row is None:
        raise RuntimeError("Coverage aggregation returned no row.")
    row["untagged_papers"] = row["total_indexed_papers"] - row["tagged_papers"]
    timestamp, warnings = _latest_successful_etl()
    return CoverageResponse(
        meta=_metadata(row, extra_warnings=warnings),
        data=CoverageData(**row, latest_successful_etl_at=timestamp),
    )


def get_topic_options(
    date_from: date | None = None,
    date_to: date | None = None,
) -> TopicsResponse:
    """Return every configured topic with dated period counts and lifetime counts.

    Requested dates restrict only period counts. Observed bounds describe the
    whole corpus, not only matching topic assignments. Invalid ranges raise ValueError.
    """
    predicate, params = publication_date_predicate(date_from, date_to)
    row = fetch_one(
        f"""
        -- Reuse indexed facts for both corpus bounds and topic counts in one
        -- statement/snapshot. Publication timestamps, not update times, drive activity.
        with indexed_papers as (
            select paper_id, published_date from fact_papers
        ), bounds as (
            select
                (min(published_date) at time zone 'UTC')::date as observed_date_from,
                (max(published_date) at time zone 'UTC')::date as observed_date_to,
                count(*) filter (where published_date is null) as undated_papers
            from indexed_papers
        ), topic_counts as (
            -- Grain: one configured topic. LEFT JOIN preserves zero-count topics;
            -- DISTINCT protects paper counts across relationships. Lifetime counts
            -- include undated IDs; UTC aware parameters constrain only period counts.
            select t.topic_id, t.topic_name,
                count(distinct p.paper_id) filter (
                    where {predicate}
                ) as period_paper_count,
                count(distinct p.paper_id) as total_indexed_paper_count
            from dim_topic t
            left join paper_topics pt on pt.topic_id = t.topic_id
            left join indexed_papers p on p.paper_id = pt.paper_id
            group by t.topic_id, t.topic_name
        )
        select bounds.*,
            coalesce((
                select jsonb_agg(to_jsonb(tc) order by tc.topic_name, tc.topic_id)
                from topic_counts tc
            ), '[]'::jsonb) as topics
        from bounds;
        """,
        tuple(params),
    )
    if row is None:
        raise RuntimeError("Topic aggregation returned no row.")
    return TopicsResponse(
        meta=_metadata(row, date_from, date_to),
        data=[TopicOption(**topic) for topic in row["topics"]],
    )
