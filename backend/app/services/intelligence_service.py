"""Read-only research analytics; calendar completeness never verifies ingestion."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from app.db import fetch_all, fetch_one
from app.schemas.intelligence import (
    CoverageData,
    CoverageResponse,
    IntelligenceMetadata,
    TopicOption,
    TopicsResponse,
    ComparisonWindow,
    ReportingInterval,
    MomentumPoint,
    MomentumTopic,
    MomentumData,
    MomentumResponse,
    MomentumMatrixTopic,
    MomentumMatrixData,
    MomentumMatrixResponse,
    AssociationTopic,
    RelationshipEdge,
    RelationshipsData,
    RelationshipsResponse,
    HeatmapCategory,
    HeatmapCell,
    TopicCategoryHeatmapData,
    TopicCategoryHeatmapResponse,
)
from app.services.research_filters import (
    publication_date_predicate,
    utc_boundaries,
)

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


class AnalyticalWindowError(ValueError):
    """A valid query requests an unsupported or insufficient reporting interval."""


MAX_MOMENTUM_WEEKS = 104
LOW_BASELINE_THRESHOLD = 10


def _reporting_context(
    date_from: date | None,
    date_to: date | None,
) -> tuple[dict, ReportingInterval, list[str]]:
    """Resolve omitted sides from corpus observations without clipping explicit dates.

    Empty dated corpora keep missing sides unresolved. Invalid resolved ranges
    raise AnalyticalWindowError; absent SQL aggregation rows remain server errors.
    """
    row = fetch_one(
        """
        select
            (min(published_date) at time zone 'UTC')::date as observed_date_from,
            (max(published_date) at time zone 'UTC')::date as observed_date_to,
            count(*) filter (where published_date is null) as undated_papers
        from fact_papers;
        """
    )
    if row is None:
        raise RuntimeError("Reporting bounds aggregation returned no row.")
    start = date_from if date_from is not None else row["observed_date_from"]
    end = date_to if date_to is not None else row["observed_date_to"]
    try:
        utc_boundaries(start, end)
    except ValueError as exc:
        raise AnalyticalWindowError(str(exc)) from exc
    warnings = []
    if row["observed_date_from"] is None:
        warnings.append("No dated indexed publications are available; reporting history cannot be inferred.")
    elif start > row["observed_date_to"] or end < row["observed_date_from"]:
        warnings.append("The reporting interval is outside observed publication bounds; zero counts do not establish absence of research.")
    return row, ReportingInterval(date_from=start, date_to=end), warnings


def _monday(day: date) -> date:
    """Return the Monday calendar date of a UTC date, including year-boundary weeks."""
    return day - timedelta(days=day.weekday())


def _comparison_windows(
    interval: ReportingInterval,
    window_weeks: int,
    now: datetime | None = None,
) -> tuple[ComparisonWindow, ComparisonWindow]:
    """Construct adjacent equal full-week windows entirely inside the interval.

    The last eligible Monday is bounded by the selected exclusive end and current
    UTC time. Too-short intervals raise AnalyticalWindowError rather than expand history.
    """
    if not 2 <= window_weeks <= 12:
        raise AnalyticalWindowError("window_weeks must be between 2 and 12.")
    lower, upper = utc_boundaries(interval.date_from, interval.date_to)
    if lower is None or upper is None:
        raise AnalyticalWindowError("Comparison windows require resolved reporting dates.")
    clock = now if now is not None else datetime.now(timezone.utc)
    if clock.tzinfo is None:
        raise AnalyticalWindowError("Comparison time must be timezone-aware.")
    eligible_end = min(upper, clock.astimezone(timezone.utc))
    end, _ = utc_boundaries(_monday(eligible_end.date()), None)
    duration = timedelta(weeks=window_weeks)
    try:
        middle, start = end - duration, end - 2 * duration
    except OverflowError as exc:
        raise AnalyticalWindowError("Comparison windows exceed supported calendar boundaries.") from exc
    if start < lower:
        raise AnalyticalWindowError("The reporting interval must contain both complete comparison windows; choose an earlier date_from or fewer window_weeks.")
    return (
        ComparisonWindow(start=start, end_exclusive=middle),
        ComparisonWindow(start=middle, end_exclusive=end),
    )


def get_momentum(
    date_from: date | None = None,
    date_to: date | None = None,
    topic_ids: list[int] | None = None,
    mode: Literal["count", "index"] = "count",
    include_partial_weeks: bool = True,
) -> MomentumResponse:
    """Return selected topics on a finite, zero-filled UTC weekly calendar.

    Index mode uses the first full week, even if its count is zero. Partial weeks
    are clipped, never rescaled. More than 104 intersecting weeks raises
    AnalyticalWindowError.
    Topic IDs are validated by the shared route dependency.
    """
    if mode not in {"count", "index"}:
        raise AnalyticalWindowError("mode must be count or index.")
    row, interval, warnings = _reporting_context(date_from, date_to)
    selection = topic_ids or None
    series: dict[int, MomentumTopic] = {}
    if interval.date_from is not None and interval.date_to is not None:
        first, last = _monday(interval.date_from), _monday(interval.date_to)
        if (last - first).days // 7 + 1 > MAX_MOMENTUM_WEEKS:
            raise AnalyticalWindowError("Momentum reporting intervals may intersect at most 104 UTC calendar weeks.")
        try:
            last + timedelta(days=7)
        except OverflowError as exc:
            raise AnalyticalWindowError("Weekly calendar boundaries exceed supported dates.") from exc
    if row["observed_date_from"] is None:
        # Without observations, preserve configured topics but invent no calendar.
        rows = fetch_all(
            """
            select topic_id, topic_name from dim_topic
            where (%s::numeric[] is null or topic_id = any(%s::numeric[]))
            order by topic_name, topic_id;
            """, (selection, selection),
        )
        series = {
            t["topic_id"]: MomentumTopic(**t, baseline_week_start=None, baseline_count=None, points=[])
            for t in rows
        }
    else:
        predicate, params = publication_date_predicate(interval.date_from, interval.date_to)
        lower, upper = utc_boundaries(interval.date_from, interval.date_to)
        rows = fetch_all(
            f"""
            -- Grain: one selected topic per generated week. Timestamp WITHOUT
            -- timezone calendar generation avoids session/DST-sensitive stepping.
            with selected_topics as (
                select topic_id, topic_name from dim_topic
                where (%s::numeric[] is null or topic_id = any(%s::numeric[]))
            ), calendar as (
                select generate_series(%s::date::timestamp, %s::date::timestamp,
                                       interval '1 week')::date as week_start
            ), weekly_counts as (
                select pt.topic_id,
                    date_trunc('week', p.published_date at time zone 'UTC')::date as week_start,
                    count(distinct p.paper_id) as paper_count
                from fact_papers p
                join paper_topics pt on pt.paper_id = p.paper_id
                join selected_topics t on t.topic_id = pt.topic_id
                -- Filter publications BEFORE grouping to clip partial weeks.
                where {predicate}
                group by pt.topic_id, date_trunc('week', p.published_date at time zone 'UTC')::date
            )
            select t.topic_id, t.topic_name, c.week_start,
                   coalesce(w.paper_count, 0) as paper_count
            from selected_topics t cross join calendar c
            left join weekly_counts w on w.topic_id = t.topic_id and w.week_start = c.week_start
            order by t.topic_name, t.topic_id, c.week_start;
            """, (selection, selection, first, last, *params),
        )
        for item in rows:
            topic = series.setdefault(item["topic_id"], MomentumTopic(
                topic_id=item["topic_id"], topic_name=item["topic_name"],
                baseline_week_start=None, baseline_count=None, points=[],
            ))
            start = item["week_start"]
            end = start + timedelta(days=7)
            week_lower, _ = utc_boundaries(start, None)
            week_upper, _ = utc_boundaries(end, None)
            effective_lower, effective_upper = max(lower, week_lower), min(upper, week_upper)
            partial = effective_lower != week_lower or effective_upper != week_upper
            if partial and not include_partial_weeks:
                continue
            topic.points.append(MomentumPoint(
                week_start=start, week_end_exclusive=end,
                effective_start=effective_lower, effective_end_exclusive=effective_upper,
                paper_count=item["paper_count"], index_value=None, is_partial_week=partial,
            ))
        if include_partial_weeks and any(p.is_partial_week for t in series.values() for p in t.points):
            warnings.append("Partial boundary weeks contain clipped counts and are not comparable to full-week volumes.")
        if mode == "index":
            for topic in series.values():
                baseline = next((p for p in topic.points if not p.is_partial_week), None)
                if baseline is None:
                    warnings.append(f"{topic.topic_name}: no full baseline week; index values are unavailable.")
                    continue
                topic.baseline_week_start = baseline.week_start
                topic.baseline_count = baseline.paper_count
                if baseline.paper_count == 0:
                    warnings.append(f"{topic.topic_name}: the first full baseline week has zero indexed papers; index values are unavailable.")
                    continue
                for point in topic.points:
                    point.index_value = 100.0 * point.paper_count / baseline.paper_count
    return MomentumResponse(
        meta=_metadata(row, date_from, date_to, warnings),
        data=MomentumData(mode=mode, interval=interval, topics=list(series.values())),
    )


def get_momentum_matrix(
    date_from: date | None = None,
    date_to: date | None = None,
    topic_ids: list[int] | None = None,
    window_weeks: int = 4,
) -> MomentumMatrixResponse:
    """Return descriptive topic growth over adjacent equal full UTC week windows.

    Previous zero counts yield no_baseline/null growth, including zero/zero topics.
    Lifetime counts include undated IDs and never inherit the reporting filter.
    An unresolved empty corpus returns null windows and zero topic metrics.
    """
    if not 2 <= window_weeks <= 12:
        raise AnalyticalWindowError("window_weeks must be between 2 and 12.")
    row, interval, warnings = _reporting_context(date_from, date_to)
    previous = recent = None
    if interval.date_from is not None and interval.date_to is not None:
        previous, recent = _comparison_windows(interval, window_weeks)
    predicate, date_params = publication_date_predicate(interval.date_from, interval.date_to)
    selection = topic_ids or None
    rows = fetch_all(
        f"""
        -- Grain: one configured/selected topic, preserved by LEFT JOIN. All counts
        -- use DISTINCT stored IDs, so overlapping or repeated bridge rows cannot
        -- inflate a topic. Only period/window aggregates have date restrictions.
        with selected_topics as (
            select topic_id, topic_name from dim_topic
            where (%s::numeric[] is null or topic_id = any(%s::numeric[]))
        )
        select t.topic_id, t.topic_name,
            count(distinct p.paper_id) filter (
                where p.published_date >= %s::timestamptz and p.published_date < %s::timestamptz
            ) as previous_paper_count,
            count(distinct p.paper_id) filter (
                where p.published_date >= %s::timestamptz and p.published_date < %s::timestamptz
            ) as recent_paper_count,
            count(distinct p.paper_id) filter (where {predicate}) as period_paper_count,
            count(distinct p.paper_id) as total_indexed_paper_count
        from selected_topics t
        left join paper_topics pt on pt.topic_id = t.topic_id
        left join fact_papers p on p.paper_id = pt.paper_id
        group by t.topic_id, t.topic_name
        order by t.topic_name, t.topic_id;
        """,
        (selection, selection,
         previous.start if previous else None, previous.end_exclusive if previous else None,
         recent.start if recent else None, recent.end_exclusive if recent else None, *date_params),
    )
    topics = []
    for item in rows:
        old, new = item["previous_paper_count"], item["recent_paper_count"]
        change = new - old
        if old == 0:
            state = "no_baseline"
        elif change > 0:
            state = "growing"
        elif change < 0:
            state = "declining"
        else:
            state = "stable"
        topics.append(MomentumMatrixTopic(
            **item, absolute_change=change,
            growth_percent=100.0 * change / old if old else None,
            growth_state=state, low_baseline=old < LOW_BASELINE_THRESHOLD,
        ))
    if any(t.low_baseline for t in topics):
        warnings.append("Some previous-window counts are below 10; growth percentages are sensitive to small baselines. This threshold is a product heuristic, not a significance test.")
    return MomentumMatrixResponse(
        meta=_metadata(row, date_from, date_to, warnings),
        data=MomentumMatrixData(
            window_weeks=window_weeks, interval=interval,
            previous_window=previous, recent_window=recent, topics=topics,
        ),
    )


def _association_ctes(
    date_from: date | None,
    date_to: date | None,
    topic_ids: list[int] | None,
) -> tuple[str, tuple[object, ...]]:
    """Prepare shared date-filtered paper/topic sets for Phase 1C aggregations.

    Omitted dates remain unbounded, unlike weekly calendar reporting. Full-corpus
    bounds and aggregates share a single statement snapshot. Topic selection
    affects topic memberships only, never the underlying filtered paper corpus.
    All substituted SQL fragments are internal; every value is bound separately.
    """
    predicate, params = publication_date_predicate(date_from, date_to)
    selection = topic_ids or None
    return f"""
        with indexed_papers as (
            select paper_id, published_date, primary_category from fact_papers
        ), bounds as (
            select
                (min(published_date) at time zone 'UTC')::date as observed_date_from,
                (max(published_date) at time zone 'UTC')::date as observed_date_to,
                count(*) filter (where published_date is null) as undated_papers
            from indexed_papers
        ), filtered_papers as (
            -- UTC aware boundaries are applied before any association expansion.
            select p.paper_id, p.primary_category from indexed_papers p
            where {predicate}
        ), selected_topics as (
            select topic_id, topic_name from dim_topic
            where (%s::numeric[] is null or topic_id = any(%s::numeric[]))
        ), topic_papers as (
            -- Grain: unique paper/topic membership. Normally guaranteed by the
            -- bridge PK; DISTINCT also protects synthetic duplicate fixtures.
            select distinct p.paper_id, pt.topic_id
            from filtered_papers p
            join paper_topics pt on pt.paper_id = p.paper_id
            join selected_topics t on t.topic_id = pt.topic_id
        ), topic_counts as (
            -- LEFT JOIN preserves selected zero-count topics. Counts include all
            -- topic papers, not just co-occurrences or mapped category papers.
            select t.topic_id, t.topic_name, count(distinct tp.paper_id) as paper_count
            from selected_topics t
            left join topic_papers tp on tp.topic_id = t.topic_id
            group by t.topic_id, t.topic_name
        )
    """, (*params, selection, selection)


def _association_ratio(numerator: int, denominator: int, scale: int = 1) -> float | None:
    """Round fractions/percentages to six decimal places; zero denominators yield null.

    JSON numeric serialization does not pad trailing zeros. Ratios describe
    indexed associations rather than statistical significance or temporal trends.
    """
    return round(scale * numerator / denominator, 6) if denominator else None


def get_relationships(
    date_from: date | None = None,
    date_to: date | None = None,
    topic_ids: list[int] | None = None,
    min_shared_papers: int = 1,
) -> RelationshipsResponse:
    """Return selected-topic co-occurrence and Jaccard overlap within the UTC interval.

    Thresholds affect only edges; node totals and Jaccard unions are independent
    of selection of other topics and thresholding. SQL failures propagate.
    """
    ctes, params = _association_ctes(date_from, date_to, topic_ids)
    row = fetch_one(
        ctes + """
        , pair_counts as (
            -- Canonical ordering excludes self/reverse links. Each shared stored
            -- ID counts once per pair, even when a paper belongs to several topics.
            select a.topic_id as topic_a_id, b.topic_id as topic_b_id,
                   count(distinct a.paper_id) as shared_paper_count
            from topic_papers a
            join topic_papers b on b.paper_id = a.paper_id and a.topic_id < b.topic_id
            group by a.topic_id, b.topic_id
            having count(distinct a.paper_id) >= %s
        )
        select bounds.*,
            coalesce((select jsonb_agg(to_jsonb(t) order by t.topic_name, t.topic_id)
                      from topic_counts t), '[]'::jsonb) as nodes,
            coalesce((select jsonb_agg(to_jsonb(e) order by e.topic_a_id, e.topic_b_id)
                      from pair_counts e), '[]'::jsonb) as edges
        from bounds;
        """, (*params, min_shared_papers),
    )
    if row is None:
        raise RuntimeError("Relationship aggregation returned no row.")
    nodes = [AssociationTopic(**node) for node in row["nodes"]]
    totals = {node.topic_id: node.paper_count for node in nodes}
    edges = []
    for edge in row["edges"]:
        union = (
            totals[edge["topic_a_id"]] + totals[edge["topic_b_id"]]
            - edge["shared_paper_count"]
        )
        edges.append(RelationshipEdge(
            **edge, jaccard_similarity=_association_ratio(edge["shared_paper_count"], union),
        ))
    return RelationshipsResponse(
        meta=_metadata(row, date_from, date_to, [
            "Topic co-occurrence represents association within indexed papers, not temporal convergence.",
        ]),
        data=RelationshipsData(
            date_from=date_from, date_to=date_to,
            min_shared_papers=min_shared_papers, nodes=nodes, edges=edges,
        ),
    )


def get_topic_category_heatmap(
    date_from: date | None = None,
    date_to: date | None = None,
    topic_ids: list[int] | None = None,
    category_scope: Literal["all", "primary"] = "all",
) -> TopicCategoryHeatmapResponse:
    """Return complete selected-topic/active-category cells and independent denominators.

    All scope uses primary and secondary bridge associations. Primary scope matches
    the exact fact primary code to dim_category. Topic totals never depend on scope;
    category totals include untagged and unselected-topic papers. SQL failures propagate.
    """
    ctes, params = _association_ctes(date_from, date_to, topic_ids)
    if category_scope == "all":
        memberships = """
            select distinct p.paper_id, pc.category_id
            from filtered_papers p
            join paper_categories pc on pc.paper_id = p.paper_id
            join dim_category c on c.category_id = pc.category_id
        """
    elif category_scope == "primary":
        memberships = """
            select p.paper_id, c.category_id
            from filtered_papers p
            join dim_category c on c.category_code = p.primary_category
        """
    else:
        raise ValueError("category_scope must be all or primary.")
    row = fetch_one(
        ctes + f"""
        , category_papers as ({memberships}), category_counts as (
            -- This denominator deliberately does not join topic_papers: it must
            -- include untagged papers and papers with only unselected topics.
            select c.category_id, c.category_code, count(distinct cp.paper_id) as paper_count
            from category_papers cp
            join dim_category c on c.category_id = cp.category_id
            group by c.category_id, c.category_code
        ), cell_counts as (
            -- Grain: one observed topic/category cell. A multi-topic/category
            -- paper legitimately contributes to multiple cells, once within each.
            select tp.topic_id, cp.category_id, count(distinct tp.paper_id) as paper_count
            from topic_papers tp
            join category_papers cp on cp.paper_id = tp.paper_id
            group by tp.topic_id, cp.category_id
        )
        select bounds.*,
            coalesce((select jsonb_agg(to_jsonb(t) order by t.topic_name, t.topic_id)
                      from topic_counts t), '[]'::jsonb) as topics,
            coalesce((select jsonb_agg(to_jsonb(c) order by c.paper_count desc, c.category_code, c.category_id)
                      from category_counts c), '[]'::jsonb) as categories,
            coalesce((select jsonb_agg(to_jsonb(x) order by x.topic_id, x.category_id)
                      from cell_counts x), '[]'::jsonb) as cells
        from bounds;
        """, params,
    )
    if row is None:
        raise RuntimeError("Heatmap aggregation returned no row.")
    topics = [AssociationTopic(**topic) for topic in row["topics"]]
    categories = [HeatmapCategory(**category) for category in row["categories"]]
    observed = {
        (cell["topic_id"], cell["category_id"]): cell["paper_count"]
        for cell in row["cells"]
    }
    cells = []
    # Zero-fill the complete Cartesian product in dimension order without per-cell
    # SQL. A zero topic denominator remains null, not an invented zero percentage.
    for topic in topics:
        for category in categories:
            count = observed.get((topic.topic_id, category.category_id), 0)
            cells.append(HeatmapCell(
                topic_id=topic.topic_id, category_id=category.category_id, paper_count=count,
                category_prevalence_pct=_association_ratio(count, category.paper_count, 100),
                topic_distribution_pct=_association_ratio(count, topic.paper_count, 100),
            ))
    warnings = ["Papers may belong to multiple topics and categories; summed cells are not a distinct-paper total."]
    if category_scope == "all":
        warnings.append("Topic distribution percentages may sum above 100% across associated categories.")
    else:
        warnings.append("Primary-category distributions sum to 100% only when every topic paper has a valid primary-category mapping.")
    return TopicCategoryHeatmapResponse(
        meta=_metadata(row, date_from, date_to, warnings),
        data=TopicCategoryHeatmapData(
            date_from=date_from, date_to=date_to, category_scope=category_scope,
            topics=topics, categories=categories, cells=cells,
        ),
    )
