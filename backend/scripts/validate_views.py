from __future__ import annotations

import logging
from pathlib import Path

from app.db import fetch_all, fetch_one


LOGGER = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
ANALYTICS_SQL_DIR = BACKEND_DIR / "sql" / "analytics"

EXPECTED_SQL_FILES = (
    "01_base_views.sql",
    "02_kpi_views.sql",
    "03_time_series.sql",
    "04_topic_analytics.sql",
    "05_category_analytics.sql",
    "06_author_analytics.sql",
    "07_dashboard_views.sql",
)

REQUIRED_WAREHOUSE_TABLES = (
    "fact_papers",
    "dim_author",
    "dim_category",
    "dim_topic",
    "paper_authors",
    "paper_categories",
    "paper_topics",
    "etl_runs",
)

EXPECTED_ANALYTICS_VIEWS = (
    # base views
    "vw_paper_topics",
    "vw_paper_categories",
    "vw_paper_authors",
    "vw_paper_details",
    # KPI views
    "vw_total_papers",
    "vw_papers_published_today",
    "vw_papers_published_this_week",
    "vw_papers_published_this_month",
    "vw_top_topic",
    "vw_top_category",
    "vw_top_author",
    "vw_latest_etl_run",
    # time-series views
    "vw_daily_paper_counts",
    "vw_weekly_paper_counts",
    "vw_monthly_paper_counts",
    "vw_cumulative_paper_counts",
    # topic analytics
    "vw_topic_distribution",
    "vw_topic_weekly_trends",
    "vw_topic_growth_30d",
    # category analytics
    "vw_category_distribution",
    "vw_primary_category_distribution",
    "vw_category_weekly_trends",
    "vw_category_growth_30d",
    "vw_category_topic_matrix",
    # author analytics
    "vw_author_rankings",
    "vw_author_topic_specialization",
    "vw_author_statistics",
    # dashboard views
    "vw_dashboard_kpis",
    "vw_latest_papers",
)


def configure_logging() -> None:
    """Configure console logging."""

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def validate_sql_files() -> None:
    """Validate the analytics SQL folder and expected files."""

    if not ANALYTICS_SQL_DIR.exists():
        raise AssertionError(
            f"Analytics SQL directory does not exist: {ANALYTICS_SQL_DIR}"
        )

    existing_files = {path.name for path in ANALYTICS_SQL_DIR.glob("*.sql")}

    missing_files = set(EXPECTED_SQL_FILES) - existing_files

    if missing_files:
        missing = ", ".join(sorted(missing_files))
        raise AssertionError(f"Missing analytics SQL files: {missing}")

    LOGGER.info(
        "PASS: All %d expected analytics SQL files exist.",
        len(EXPECTED_SQL_FILES),
    )


def validate_database_connection() -> None:
    """Confirm that PostgreSQL can be queried."""

    result = fetch_one(
        """
        select
            current_database() as database_name,
            current_schema() as schema_name;
        """
    )

    if result is None:
        raise AssertionError("Database connection query returned no result.")

    LOGGER.info(
        "PASS: Connected to database '%s', schema '%s'.",
        result["database_name"],
        result["schema_name"],
    )


def get_existing_public_relations(
    relation_type: str,
) -> set[str]:
    """Return table or view names from the public schema."""

    if relation_type == "table":
        query = """
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_type = 'BASE TABLE';
        """
    elif relation_type == "view":
        query = """
            select table_name
            from information_schema.views
            where table_schema = 'public';
        """
    else:
        raise ValueError("relation_type must be either 'table' or 'view'.")

    rows = fetch_all(query)
    return {row["table_name"] for row in rows}


def validate_warehouse_tables() -> None:
    """Confirm all analytics source tables exist."""

    existing_tables = get_existing_public_relations("table")
    missing_tables = set(REQUIRED_WAREHOUSE_TABLES) - existing_tables

    if missing_tables:
        missing = ", ".join(sorted(missing_tables))
        raise AssertionError(f"Missing required warehouse tables: {missing}")

    LOGGER.info(
        "PASS: All %d required warehouse tables exist.",
        len(REQUIRED_WAREHOUSE_TABLES),
    )


def validate_analytics_views() -> None:
    """Confirm all implemented analytics views exist."""

    if not EXPECTED_ANALYTICS_VIEWS:
        LOGGER.info("SKIP: No analytics views have been implemented yet.")
        return

    existing_views = get_existing_public_relations("view")
    missing_views = set(EXPECTED_ANALYTICS_VIEWS) - existing_views

    if missing_views:
        missing = ", ".join(sorted(missing_views))
        raise AssertionError(f"Missing expected analytics views: {missing}")

    LOGGER.info(
        "PASS: All %d expected analytics views exist.",
        len(EXPECTED_ANALYTICS_VIEWS),
    )


def validate_paper_details_grain() -> None:
    """Confirm vw_paper_details contains exactly one row per paper."""

    result = fetch_one(
        """
        select
            (select count(*) from fact_papers) as fact_count,
            (select count(*) from vw_paper_details) as view_count,
            (
                select count(*)
                from (
                    select paper_id
                    from vw_paper_details
                    group by paper_id
                    having count(*) > 1
                ) duplicate_papers
            ) as duplicate_paper_count;
        """
    )

    if result is None:
        raise AssertionError("Paper-details validation returned no result.")

    if result["fact_count"] != result["view_count"]:
        raise AssertionError(
            "vw_paper_details row count does not match fact_papers. "
            f"fact_count={result['fact_count']}, "
            f"view_count={result['view_count']}"
        )

    if result["duplicate_paper_count"] != 0:
        raise AssertionError(
            "vw_paper_details contains duplicate paper rows. "
            f"duplicate_paper_count="
            f"{result['duplicate_paper_count']}"
        )

    LOGGER.info(
        "PASS: vw_paper_details contains exactly one row per paper (%d rows).",
        result["view_count"],
    )


def validate_relationship_view_counts() -> None:
    """Confirm relationship views match their bridge-table row counts."""

    checks = (
        ("paper_topics", "vw_paper_topics"),
        ("paper_categories", "vw_paper_categories"),
        ("paper_authors", "vw_paper_authors"),
    )

    for bridge_table, view_name in checks:
        result = fetch_one(
            f"""
            select
                (select count(*) from {bridge_table}) as bridge_count,
                (select count(*) from {view_name}) as view_count;
            """
        )

        if result is None:
            raise AssertionError(f"Validation returned no result for {view_name}.")

        if result["bridge_count"] != result["view_count"]:
            raise AssertionError(
                f"{view_name} does not match {bridge_table}. "
                f"bridge_count={result['bridge_count']}, "
                f"view_count={result['view_count']}"
            )

        LOGGER.info(
            "PASS: %s matches %s (%d rows).",
            view_name,
            bridge_table,
            result["view_count"],
        )


## PHASE C: KPI VALIDATION FUNCTIONS ##
def validate_single_row_kpi_views() -> None:
    """Confirm that KPI views never return more than one row."""

    single_row_views = (
        "vw_total_papers",
        "vw_papers_published_today",
        "vw_papers_published_this_week",
        "vw_papers_published_this_month",
        "vw_top_topic",
        "vw_top_category",
        "vw_top_author",
        "vw_latest_etl_run",
    )

    for view_name in single_row_views:
        result = fetch_one(
            f"""
            select count(*) as row_count
            from {view_name};
            """
        )

        if result is None:
            raise AssertionError(
                f"Row-count validation returned no result for {view_name}."
            )

        row_count = result["row_count"]

        if row_count > 1:
            raise AssertionError(
                f"{view_name} should return at most one row, "
                f"but returned {row_count} rows."
            )

        LOGGER.info(
            "PASS: %s returns %d row(s).",
            view_name,
            row_count,
        )


def validate_total_papers_kpi() -> None:
    """Confirm the total-paper KPI matches fact_papers."""

    result = fetch_one(
        """
        select
            (
                select count(distinct paper_id)
                from fact_papers
            ) as expected_total,
            (
                select total_papers
                from vw_total_papers
            ) as actual_total;
        """
    )

    if result is None:
        raise AssertionError("Total-paper KPI validation returned no result.")

    if result["expected_total"] != result["actual_total"]:
        raise AssertionError(
            "vw_total_papers does not match fact_papers. "
            f"expected={result['expected_total']}, "
            f"actual={result['actual_total']}"
        )

    LOGGER.info(
        "PASS: vw_total_papers matches fact_papers (%d papers).",
        result["actual_total"],
    )


def validate_publication_period_kpis() -> None:
    """Confirm today, week, and month KPIs match source calculations."""

    result = fetch_one(
        """
        select
            (
                select count(distinct paper_id)
                from fact_papers
                where published_date::date = current_date
            ) as expected_today,

            (
                select papers_published_today
                from vw_papers_published_today
            ) as actual_today,

            (
                select count(distinct paper_id)
                from fact_papers
                where published_date >= date_trunc(
                    'week',
                    current_date
                )
            ) as expected_week,

            (
                select papers_published_this_week
                from vw_papers_published_this_week
            ) as actual_week,

            (
                select count(distinct paper_id)
                from fact_papers
                where published_date >= date_trunc(
                    'month',
                    current_date
                )
            ) as expected_month,

            (
                select papers_published_this_month
                from vw_papers_published_this_month
            ) as actual_month;
        """
    )

    if result is None:
        raise AssertionError("Publication-period KPI validation returned no result.")

    checks = (
        (
            "papers published today",
            result["expected_today"],
            result["actual_today"],
        ),
        (
            "papers published this week",
            result["expected_week"],
            result["actual_week"],
        ),
        (
            "papers published this month",
            result["expected_month"],
            result["actual_month"],
        ),
    )

    for metric_name, expected, actual in checks:
        if expected != actual:
            raise AssertionError(
                f"Incorrect KPI for {metric_name}. expected={expected}, actual={actual}"
            )

        LOGGER.info(
            "PASS: %s KPI is correct (%d).",
            metric_name,
            actual,
        )


def validate_top_topic_kpi() -> None:
    """Confirm the top-topic KPI uses the highest paper count."""

    result = fetch_one(
        """
        select
            (
                select max(topic_count)
                from (
                    select
                        topic_id,
                        count(distinct paper_id) as topic_count
                    from vw_paper_topics
                    group by topic_id
                ) topic_counts
            ) as expected_max_count,

            (
                select paper_count
                from vw_top_topic
            ) as actual_count;
        """
    )

    if result is None:
        raise AssertionError("Top-topic KPI validation returned no result.")

    if result["expected_max_count"] != result["actual_count"]:
        raise AssertionError(
            "vw_top_topic does not contain a topic with the "
            "maximum distinct-paper count. "
            f"expected={result['expected_max_count']}, "
            f"actual={result['actual_count']}"
        )

    LOGGER.info(
        "PASS: vw_top_topic has the maximum topic count (%s).",
        result["actual_count"],
    )


def validate_top_category_kpi() -> None:
    """Confirm the top-category KPI uses all category associations."""

    result = fetch_one(
        """
        select
            (
                select max(category_count)
                from (
                    select
                        category_id,
                        count(distinct paper_id) as category_count
                    from vw_paper_categories
                    group by category_id
                ) category_counts
            ) as expected_max_count,

            (
                select paper_count
                from vw_top_category
            ) as actual_count;
        """
    )

    if result is None:
        raise AssertionError("Top-category KPI validation returned no result.")

    if result["expected_max_count"] != result["actual_count"]:
        raise AssertionError(
            "vw_top_category does not contain a category with "
            "the maximum distinct-paper count. "
            f"expected={result['expected_max_count']}, "
            f"actual={result['actual_count']}"
        )

    LOGGER.info(
        "PASS: vw_top_category has the maximum category count (%s).",
        result["actual_count"],
    )


def validate_top_author_kpi() -> None:
    """Confirm the top-author KPI uses distinct paper counts."""

    result = fetch_one(
        """
        select
            (
                select max(author_count)
                from (
                    select
                        author_id,
                        count(distinct paper_id) as author_count
                    from vw_paper_authors
                    group by author_id
                ) author_counts
            ) as expected_max_count,

            (
                select paper_count
                from vw_top_author
            ) as actual_count;
        """
    )

    if result is None:
        raise AssertionError("Top-author KPI validation returned no result.")

    if result["expected_max_count"] != result["actual_count"]:
        raise AssertionError(
            "vw_top_author does not contain an author with the "
            "maximum distinct-paper count. "
            f"expected={result['expected_max_count']}, "
            f"actual={result['actual_count']}"
        )

    LOGGER.info(
        "PASS: vw_top_author has the maximum author count (%s).",
        result["actual_count"],
    )


def validate_latest_etl_run_kpi() -> None:
    """Confirm the KPI exposes the most recently started ETL run."""

    result = fetch_one(
        """
        select
            (
                select run_id
                from etl_runs
                order by
                    start_time desc,
                    run_id desc
                limit 1
            ) as expected_run_id,

            (
                select run_id
                from vw_latest_etl_run
            ) as actual_run_id;
        """
    )

    if result is None:
        raise AssertionError("Latest-ETL-run validation returned no result.")

    if result["expected_run_id"] != result["actual_run_id"]:
        raise AssertionError(
            "vw_latest_etl_run does not expose the latest ETL run. "
            f"expected={result['expected_run_id']}, "
            f"actual={result['actual_run_id']}"
        )

    LOGGER.info(
        "PASS: vw_latest_etl_run exposes the latest ETL run (%s).",
        result["actual_run_id"],
    )


## TIME SERIES FUNCTIONS ##
def validate_time_series_totals() -> None:
    """Confirm time-series totals match published warehouse papers."""

    result = fetch_one(
        """
        select
            (
                select count(distinct paper_id)
                from fact_papers
                where published_date is not null
            ) as expected_total,

            (
                select coalesce(sum(paper_count), 0)
                from vw_daily_paper_counts
            ) as daily_total,

            (
                select coalesce(sum(paper_count), 0)
                from vw_weekly_paper_counts
            ) as weekly_total,

            (
                select coalesce(sum(paper_count), 0)
                from vw_monthly_paper_counts
            ) as monthly_total;
        """
    )

    if result is None:
        raise AssertionError("Time-series total validation returned no result.")

    expected_total = result["expected_total"]

    checks = (
        ("daily", result["daily_total"]),
        ("weekly", result["weekly_total"]),
        ("monthly", result["monthly_total"]),
    )

    for grain_name, actual_total in checks:
        if actual_total != expected_total:
            raise AssertionError(
                f"{grain_name.capitalize()} paper counts do not "
                f"sum to the expected total. "
                f"expected={expected_total}, actual={actual_total}"
            )

        LOGGER.info(
            "PASS: %s paper counts sum to %d.",
            grain_name.capitalize(),
            actual_total,
        )


def validate_time_series_unique_periods() -> None:
    """Confirm each time-series view contains one row per period."""

    checks = (
        (
            "vw_daily_paper_counts",
            "publication_date",
        ),
        (
            "vw_weekly_paper_counts",
            "week_start",
        ),
        (
            "vw_monthly_paper_counts",
            "month_start",
        ),
        (
            "vw_cumulative_paper_counts",
            "publication_date",
        ),
    )

    for view_name, period_column in checks:
        result = fetch_one(
            f"""
            select count(*) as duplicate_period_count
            from (
                select
                    {period_column}
                from {view_name}
                group by {period_column}
                having count(*) > 1
            ) duplicate_periods;
            """
        )

        if result is None:
            raise AssertionError(
                f"Period validation returned no result for {view_name}."
            )

        if result["duplicate_period_count"] != 0:
            raise AssertionError(
                f"{view_name} contains duplicate period rows. "
                f"duplicate_period_count="
                f"{result['duplicate_period_count']}"
            )

        LOGGER.info(
            "PASS: %s contains one row per period.",
            view_name,
        )


def validate_cumulative_paper_counts() -> None:
    """Confirm the cumulative series ends at the published-paper total."""

    result = fetch_one(
        """
        select
            (
                select count(distinct paper_id)
                from fact_papers
                where published_date is not null
            ) as expected_total,

            (
                select cumulative_papers
                from vw_cumulative_paper_counts
                order by publication_date desc
                limit 1
            ) as final_cumulative_total,

            (
                select count(*)
                from (
                    select
                        publication_date,
                        cumulative_papers,
                        lag(cumulative_papers) over (
                            order by publication_date
                        ) as previous_cumulative
                    from vw_cumulative_paper_counts
                ) cumulative_rows
                where previous_cumulative is not null
                  and cumulative_papers < previous_cumulative
            ) as decreasing_row_count;
        """
    )

    if result is None:
        raise AssertionError("Cumulative-paper validation returned no result.")

    final_total = result["final_cumulative_total"]

    if final_total != result["expected_total"]:
        raise AssertionError(
            "The cumulative series does not end at the expected "
            "published-paper total. "
            f"expected={result['expected_total']}, "
            f"actual={final_total}"
        )

    if result["decreasing_row_count"] != 0:
        raise AssertionError(
            "The cumulative paper count decreases at one or more dates."
        )

    LOGGER.info(
        "PASS: Cumulative paper count ends at %d and never decreases.",
        final_total,
    )


## PHASE E: TOPIC ANALYTICS ##
def validate_week_start_dates() -> None:
    """Confirm every weekly period begins on Monday."""

    result = fetch_one(
        """
        select count(*) as invalid_week_start_count
        from vw_weekly_paper_counts
        where extract(isodow from week_start) <> 1;
        """
    )

    if result is None:
        raise AssertionError("Week-start validation returned no result.")

    if result["invalid_week_start_count"] != 0:
        raise AssertionError(
            "vw_weekly_paper_counts contains week-start dates that are not Mondays."
        )

    LOGGER.info("PASS: All weekly periods begin on Monday.")


def validate_topic_distribution() -> None:
    """Validate topic distribution counts and percentages."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from dim_topic
            ) as expected_topic_count,

            (
                select count(*)
                from vw_topic_distribution
            ) as actual_topic_count,

            (
                select count(*)
                from (
                    select topic_id
                    from vw_topic_distribution
                    group by topic_id
                    having count(*) > 1
                ) duplicate_topics
            ) as duplicate_topic_count,

            (
                select count(*)
                from vw_topic_distribution
                where paper_count < 0
                   or percentage_of_tagged_papers < 0
                   or percentage_of_tagged_papers > 100
            ) as invalid_metric_count;
        """
    )

    if result is None:
        raise AssertionError("Topic-distribution validation returned no result.")

    if result["expected_topic_count"] != result["actual_topic_count"]:
        raise AssertionError(
            "vw_topic_distribution does not contain one row "
            "for every topic. "
            f"expected={result['expected_topic_count']}, "
            f"actual={result['actual_topic_count']}"
        )

    if result["duplicate_topic_count"] != 0:
        raise AssertionError("vw_topic_distribution contains duplicate topic rows.")

    if result["invalid_metric_count"] != 0:
        raise AssertionError(
            "vw_topic_distribution contains invalid counts or percentages."
        )

    LOGGER.info(
        "PASS: vw_topic_distribution contains %d valid topics.",
        result["actual_topic_count"],
    )


def validate_topic_distribution_counts() -> None:
    """Confirm topic distribution matches paper-topic relationships."""

    result = fetch_one(
        """
        select count(*) as mismatch_count
        from (
            select
                dt.topic_id,

                count(distinct pt.paper_id) as expected_count,

                coalesce(
                    vtd.paper_count,
                    0
                ) as actual_count

            from dim_topic dt

            left join paper_topics pt
                on dt.topic_id = pt.topic_id

            left join vw_topic_distribution vtd
                on dt.topic_id = vtd.topic_id

            group by
                dt.topic_id,
                vtd.paper_count
        ) topic_checks
        where expected_count <> actual_count;
        """
    )

    if result is None:
        raise AssertionError("Topic-count reconciliation returned no result.")

    if result["mismatch_count"] != 0:
        raise AssertionError(
            "One or more topic-distribution counts do not match paper_topics."
        )

    LOGGER.info("PASS: Topic-distribution counts match paper_topics.")


def validate_topic_weekly_trends() -> None:
    """Validate weekly topic grain, totals, and week boundaries."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from (
                    select
                        week_start,
                        topic_id
                    from vw_topic_weekly_trends
                    group by
                        week_start,
                        topic_id
                    having count(*) > 1
                ) duplicate_rows
            ) as duplicate_period_topic_count,

            (
                select count(*)
                from vw_topic_weekly_trends
                where extract(isodow from week_start) <> 1
            ) as invalid_week_start_count,

            (
                select coalesce(sum(paper_count), 0)
                from vw_topic_weekly_trends
            ) as weekly_topic_total,

            (
                select count(*)
                from paper_topics pt
                join fact_papers fp
                    on pt.paper_id = fp.paper_id
                where fp.published_date is not null
            ) as expected_relationship_total;
        """
    )

    if result is None:
        raise AssertionError("Weekly-topic validation returned no result.")

    if result["duplicate_period_topic_count"] != 0:
        raise AssertionError(
            "vw_topic_weekly_trends contains duplicate topic-week rows."
        )

    if result["invalid_week_start_count"] != 0:
        raise AssertionError(
            "vw_topic_weekly_trends contains weeks that do not begin on Monday."
        )

    if result["weekly_topic_total"] != result["expected_relationship_total"]:
        raise AssertionError(
            "Weekly topic counts do not reconcile with "
            "paper_topics. "
            f"expected={result['expected_relationship_total']}, "
            f"actual={result['weekly_topic_total']}"
        )

    LOGGER.info(
        "PASS: Weekly topic trends reconcile to %d paper-topic relationships.",
        result["weekly_topic_total"],
    )


def validate_topic_growth() -> None:
    """Validate topic growth calculations and period boundaries."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from dim_topic
            ) as expected_topic_count,

            (
                select count(*)
                from vw_topic_growth_30d
            ) as actual_topic_count,

            (
                select count(*)
                from vw_topic_growth_30d
                where current_30_day_count < 0
                   or previous_30_day_count < 0
                   or absolute_growth
                       <> current_30_day_count
                          - previous_30_day_count
            ) as invalid_count_rows,

            (
                select count(*)
                from vw_topic_growth_30d
                where previous_30_day_count = 0
                  and growth_percentage is not null
            ) as invalid_zero_baseline_rows,

            (
                select count(*)
                from vw_topic_growth_30d
                where current_period_end
                      - current_period_start <> 29
                   or previous_period_end
                      - previous_period_start <> 29
                   or current_period_start
                      <> previous_period_end + 1
            ) as invalid_period_rows;
        """
    )

    if result is None:
        raise AssertionError("Topic-growth validation returned no result.")

    if result["expected_topic_count"] != result["actual_topic_count"]:
        raise AssertionError("vw_topic_growth_30d does not contain one row per topic.")

    if result["invalid_count_rows"] != 0:
        raise AssertionError(
            "vw_topic_growth_30d contains invalid count "
            "or absolute-growth calculations."
        )

    if result["invalid_zero_baseline_rows"] != 0:
        raise AssertionError(
            "Topic growth percentage should be null when the "
            "previous-period count is zero."
        )

    if result["invalid_period_rows"] != 0:
        raise AssertionError(
            "vw_topic_growth_30d contains incorrect 30-day period boundaries."
        )

    LOGGER.info(
        "PASS: Topic growth contains %d valid topic rows.",
        result["actual_topic_count"],
    )


## PHASE F.1: CATEGORY DISTRIBUTION ##
def validate_category_distribution() -> None:
    """Validate all-category distribution grain and values."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from dim_category
            ) as expected_category_count,

            (
                select count(*)
                from vw_category_distribution
            ) as actual_category_count,

            (
                select count(*)
                from (
                    select category_id
                    from vw_category_distribution
                    group by category_id
                    having count(*) > 1
                ) duplicate_categories
            ) as duplicate_category_count,

            (
                select count(*)
                from vw_category_distribution
                where paper_count < 0
                   or percentage_of_categorized_papers < 0
                   or percentage_of_categorized_papers > 100
            ) as invalid_metric_count;
        """
    )

    if result is None:
        raise AssertionError("Category-distribution validation returned no result.")

    if result["expected_category_count"] != result["actual_category_count"]:
        raise AssertionError(
            "vw_category_distribution does not contain one row "
            "for every category. "
            f"expected={result['expected_category_count']}, "
            f"actual={result['actual_category_count']}"
        )

    if result["duplicate_category_count"] != 0:
        raise AssertionError(
            "vw_category_distribution contains duplicate category rows."
        )

    if result["invalid_metric_count"] != 0:
        raise AssertionError(
            "vw_category_distribution contains invalid counts or percentages."
        )

    LOGGER.info(
        "PASS: vw_category_distribution contains %d valid categories.",
        result["actual_category_count"],
    )


## PHASE F.2: CATEGORY COUNT RECONCILIATION
def validate_category_distribution_counts() -> None:
    """Confirm category distribution matches category relationships."""

    result = fetch_one(
        """
        select count(*) as mismatch_count
        from (
            select
                dc.category_id,

                count(distinct pc.paper_id) as expected_count,

                coalesce(
                    vcd.paper_count,
                    0
                ) as actual_count

            from dim_category dc

            left join paper_categories pc
                on dc.category_id = pc.category_id

            left join vw_category_distribution vcd
                on dc.category_id = vcd.category_id

            group by
                dc.category_id,
                vcd.paper_count
        ) category_checks
        where expected_count <> actual_count;
        """
    )

    if result is None:
        raise AssertionError("Category-count reconciliation returned no result.")

    if result["mismatch_count"] != 0:
        raise AssertionError(
            "One or more category distribution counts do not match paper_categories."
        )

    LOGGER.info("PASS: Category-distribution counts match paper_categories.")


## PHASE F.3: PRIMARY-CATEGORY ##
def validate_primary_category_distribution() -> None:
    """Validate primary-category counts and total reconciliation."""

    result = fetch_one(
        """
        select
            (
                select count(distinct primary_category)
                from fact_papers
                where primary_category is not null
            ) as expected_category_count,

            (
                select count(*)
                from vw_primary_category_distribution
            ) as actual_category_count,

            (
                select count(distinct paper_id)
                from fact_papers
                where primary_category is not null
            ) as expected_paper_total,

            (
                select coalesce(sum(paper_count), 0)
                from vw_primary_category_distribution
            ) as actual_paper_total,

            (
                select count(*)
                from (
                    select category_code
                    from vw_primary_category_distribution
                    group by category_code
                    having count(*) > 1
                ) duplicates
            ) as duplicate_category_count;
        """
    )

    if result is None:
        raise AssertionError("Primary-category validation returned no result.")

    if result["expected_category_count"] != result["actual_category_count"]:
        raise AssertionError(
            "vw_primary_category_distribution has an incorrect number of categories."
        )

    if result["expected_paper_total"] != result["actual_paper_total"]:
        raise AssertionError(
            "Primary-category counts do not sum to the expected "
            "paper total. "
            f"expected={result['expected_paper_total']}, "
            f"actual={result['actual_paper_total']}"
        )

    if result["duplicate_category_count"] != 0:
        raise AssertionError(
            "vw_primary_category_distribution contains duplicate category rows."
        )

    LOGGER.info(
        "PASS: Primary-category distribution sums to %d papers.",
        result["actual_paper_total"],
    )


## PHASE F.4: WEEKLY CATEGORY ##
def validate_category_weekly_trends() -> None:
    """Validate category-week grain and relationship totals."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from (
                    select
                        week_start,
                        category_id
                    from vw_category_weekly_trends
                    group by
                        week_start,
                        category_id
                    having count(*) > 1
                ) duplicate_rows
            ) as duplicate_period_category_count,

            (
                select count(*)
                from vw_category_weekly_trends
                where extract(isodow from week_start) <> 1
            ) as invalid_week_start_count,

            (
                select coalesce(sum(paper_count), 0)
                from vw_category_weekly_trends
            ) as weekly_category_total,

            (
                select count(*)
                from paper_categories pc
                join fact_papers fp
                    on pc.paper_id = fp.paper_id
                where fp.published_date is not null
            ) as expected_relationship_total;
        """
    )

    if result is None:
        raise AssertionError("Weekly-category validation returned no result.")

    if result["duplicate_period_category_count"] != 0:
        raise AssertionError(
            "vw_category_weekly_trends contains duplicate category-week rows."
        )

    if result["invalid_week_start_count"] != 0:
        raise AssertionError(
            "vw_category_weekly_trends contains weeks that do not begin on Monday."
        )

    if result["weekly_category_total"] != result["expected_relationship_total"]:
        raise AssertionError(
            "Weekly category counts do not reconcile with "
            "paper_categories. "
            f"expected={result['expected_relationship_total']}, "
            f"actual={result['weekly_category_total']}"
        )

    LOGGER.info(
        "PASS: Weekly category trends reconcile to %d paper-category relationships.",
        result["weekly_category_total"],
    )


## PHASE F.5: CATEGORY GROWTH ##def validate_category_growth() -> None:
def validate_category_growth() -> None:
    """Validate category growth calculations and periods."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from dim_category
            ) as expected_category_count,

            (
                select count(*)
                from vw_category_growth_30d
            ) as actual_category_count,

            (
                select count(*)
                from vw_category_growth_30d
                where current_30_day_count < 0
                   or previous_30_day_count < 0
                   or absolute_growth
                       <> current_30_day_count
                          - previous_30_day_count
            ) as invalid_count_rows,

            (
                select count(*)
                from vw_category_growth_30d
                where previous_30_day_count = 0
                  and growth_percentage is not null
            ) as invalid_zero_baseline_rows,

            (
                select count(*)
                from vw_category_growth_30d
                where current_period_end
                      - current_period_start <> 29
                   or previous_period_end
                      - previous_period_start <> 29
                   or current_period_start
                      <> previous_period_end + 1
            ) as invalid_period_rows;
        """
    )

    if result is None:
        raise AssertionError("Category-growth validation returned no result.")

    if result["expected_category_count"] != result["actual_category_count"]:
        raise AssertionError(
            "vw_category_growth_30d does not contain one row per category."
        )

    if result["invalid_count_rows"] != 0:
        raise AssertionError(
            "vw_category_growth_30d contains invalid count or "
            "absolute-growth calculations."
        )

    if result["invalid_zero_baseline_rows"] != 0:
        raise AssertionError(
            "Category growth percentage should be null when the "
            "previous-period count is zero."
        )

    if result["invalid_period_rows"] != 0:
        raise AssertionError(
            "vw_category_growth_30d contains incorrect period boundaries."
        )

    LOGGER.info(
        "PASS: Category growth contains %d valid category rows.",
        result["actual_category_count"],
    )


## PHASE F.6:CATEGORY-TOPIC MATRIX
def validate_category_topic_matrix() -> None:
    """Validate category-topic matrix grain and counts."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from (
                    select
                        category_id,
                        topic_id
                    from vw_category_topic_matrix
                    group by
                        category_id,
                        topic_id
                    having count(*) > 1
                ) duplicate_pairs
            ) as duplicate_pair_count,

            (
                select count(*)
                from vw_category_topic_matrix
                where shared_paper_count <= 0
            ) as invalid_count_rows,

            (
                select count(*)
                from (
                    select
                        matrix.category_id,
                        matrix.topic_id,
                        matrix.shared_paper_count,
                        expected.expected_count
                    from vw_category_topic_matrix matrix
                    join (
                        select
                            pc.category_id,
                            pt.topic_id,
                            count(
                                distinct pc.paper_id
                            ) as expected_count
                        from paper_categories pc
                        join paper_topics pt
                            on pc.paper_id = pt.paper_id
                        group by
                            pc.category_id,
                            pt.topic_id
                    ) expected
                        on matrix.category_id
                           = expected.category_id
                       and matrix.topic_id
                           = expected.topic_id
                    where matrix.shared_paper_count
                          <> expected.expected_count
                ) mismatches
            ) as mismatch_count;
        """
    )

    if result is None:
        raise AssertionError("Category-topic matrix validation returned no result.")

    if result["duplicate_pair_count"] != 0:
        raise AssertionError(
            "vw_category_topic_matrix contains duplicate category-topic pairs."
        )

    if result["invalid_count_rows"] != 0:
        raise AssertionError(
            "vw_category_topic_matrix contains non-positive shared-paper counts."
        )

    if result["mismatch_count"] != 0:
        raise AssertionError("One or more category-topic matrix counts are incorrect.")

    LOGGER.info("PASS: Category-topic matrix contains valid unique pairs.")


## PHASE G ##
## AUTHOR RANKING ##
def validate_author_rankings() -> None:
    """
    Validate author-ranking grain, source reconciliation,
    and logical invariants.
    """

    result = fetch_one(
        """
        select
            (
                select count(*)
                from dim_author
            ) as expected_author_count,

            (
                select count(*)
                from vw_author_rankings
            ) as actual_author_count,

            (
                select count(*)
                from (
                    select author_id
                    from vw_author_rankings
                    group by author_id
                    having count(*) > 1
                ) duplicate_authors
            ) as duplicate_author_count,

            (
                select count(*)
                from vw_author_rankings
                where paper_count < 0
                   or distinct_topic_count < 0
                   or distinct_category_count < 0
            ) as negative_count_rows,

            (
                select count(*)
                from vw_author_rankings
                where distinct_topic_count >
                      (
                          select count(*)
                          from dim_topic
                      )
            ) as excessive_topic_count_rows,

            (
                select count(*)
                from vw_author_rankings
                where distinct_category_count >
                      (
                          select count(*)
                          from dim_category
                      )
            ) as excessive_category_count_rows,

            (
                select count(*)
                from vw_author_rankings
                where latest_publication_date > current_timestamp
            ) as future_publication_rows;
        """
    )

    if result is None:
        raise AssertionError("Author-ranking validation returned no result.")

    if result["expected_author_count"] != result["actual_author_count"]:
        raise AssertionError(
            "vw_author_rankings does not contain one row "
            "per author. "
            f"expected={result['expected_author_count']}, "
            f"actual={result['actual_author_count']}"
        )

    if result["duplicate_author_count"] != 0:
        raise AssertionError("vw_author_rankings contains duplicate author rows.")

    if result["negative_count_rows"] != 0:
        raise AssertionError("vw_author_rankings contains negative metric values.")

    if result["excessive_topic_count_rows"] != 0:
        raise AssertionError(
            "One or more authors have a distinct_topic_count "
            "greater than the total number of topics."
        )

    if result["excessive_category_count_rows"] != 0:
        raise AssertionError(
            "One or more authors have a distinct_category_count "
            "greater than the total number of categories."
        )

    if result["future_publication_rows"] != 0:
        raise AssertionError(
            "One or more authors have a latest publication date in the future."
        )

    LOGGER.info(
        "PASS: vw_author_rankings contains %d valid authors.",
        result["actual_author_count"],
    )


## AUTHOR RANKING COUNT RECONCILIATION ##
def validate_author_ranking_counts() -> None:
    """Confirm author-ranking values match warehouse relationships."""

    result = fetch_one(
        """
        select count(*) as mismatch_count
        from (
            select
                da.author_id,

                count(
                    distinct pa.paper_id
                ) as expected_paper_count,

                count(
                    distinct pt.topic_id
                ) as expected_topic_count,

                count(
                    distinct pc.category_id
                ) as expected_category_count,

                max(
                    fp.published_date
                ) as expected_latest_publication,

                var.paper_count as actual_paper_count,
                var.distinct_topic_count as actual_topic_count,
                var.distinct_category_count as actual_category_count,
                var.latest_publication_date
                    as actual_latest_publication

            from dim_author da

            left join paper_authors pa
                on da.author_id = pa.author_id

            left join fact_papers fp
                on pa.paper_id = fp.paper_id

            left join paper_topics pt
                on pa.paper_id = pt.paper_id

            left join paper_categories pc
                on pa.paper_id = pc.paper_id

            join vw_author_rankings var
                on da.author_id = var.author_id

            group by
                da.author_id,
                var.paper_count,
                var.distinct_topic_count,
                var.distinct_category_count,
                var.latest_publication_date
        ) checks

        where expected_paper_count <> actual_paper_count
           or expected_topic_count <> actual_topic_count
           or expected_category_count <> actual_category_count
           or expected_latest_publication
              is distinct from actual_latest_publication;
        """
    )

    if result is None:
        raise AssertionError("Author-ranking reconciliation returned no result.")

    if result["mismatch_count"] != 0:
        raise AssertionError(
            "One or more vw_author_rankings values do not "
            "match warehouse relationships."
        )

    LOGGER.info("PASS: Author-ranking metrics reconcile with warehouse data.")


## AUTHOR-TOPIC SPECIALIZATION ##
def validate_author_topic_specialization() -> None:
    """Validate author-topic grain and distinct-paper counts."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from (
                    select
                        author_id,
                        topic_id
                    from vw_author_topic_specialization
                    group by
                        author_id,
                        topic_id
                    having count(*) > 1
                ) duplicate_pairs
            ) as duplicate_pair_count,

            (
                select count(*)
                from vw_author_topic_specialization
                where paper_count <= 0
            ) as invalid_count_rows,

            (
                select count(*)
                from (
                    select
                        vats.author_id,
                        vats.topic_id,
                        vats.paper_count as actual_count,
                        expected.expected_count

                    from vw_author_topic_specialization vats

                    join (
                        select
                            pa.author_id,
                            pt.topic_id,
                            count(
                                distinct pa.paper_id
                            ) as expected_count

                        from paper_authors pa

                        join paper_topics pt
                            on pa.paper_id = pt.paper_id

                        group by
                            pa.author_id,
                            pt.topic_id
                    ) expected
                        on vats.author_id = expected.author_id
                       and vats.topic_id = expected.topic_id

                    where vats.paper_count
                          <> expected.expected_count
                ) mismatches
            ) as mismatch_count;
        """
    )

    if result is None:
        raise AssertionError("Author-topic validation returned no result.")

    if result["duplicate_pair_count"] != 0:
        raise AssertionError(
            "vw_author_topic_specialization contains duplicate author-topic pairs."
        )

    if result["invalid_count_rows"] != 0:
        raise AssertionError(
            "vw_author_topic_specialization contains non-positive paper counts."
        )

    if result["mismatch_count"] != 0:
        raise AssertionError("One or more author-topic paper counts are incorrect.")

    LOGGER.info(
        "PASS: Author-topic specialization contains valid unique author-topic pairs."
    )


## AUTHOR CONTRIBUTION STATS ##
def validate_author_statistics() -> None:
    """Validate the single-row author collaboration statistics."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from vw_author_statistics
            ) as statistics_row_count,

            vas.average_authors_per_paper,
            vas.median_authors_per_paper,
            vas.maximum_authors_per_paper,
            vas.single_author_papers,
            vas.multi_author_papers,

            (
                select count(distinct paper_id)
                from paper_authors
            ) as authored_paper_count,

            (
                select count(*)
                from fact_papers fp
                where not exists (
                    select 1
                    from paper_authors pa
                    where pa.paper_id = fp.paper_id
                )
            ) as papers_without_authors

        from vw_author_statistics vas;
        """
    )

    if result is None:
        raise AssertionError("Author-statistics validation returned no result.")

    if result["statistics_row_count"] != 1:
        raise AssertionError("vw_author_statistics must return exactly one row.")

    average_authors = result["average_authors_per_paper"]
    median_authors = result["median_authors_per_paper"]
    maximum_authors = result["maximum_authors_per_paper"]

    if average_authors is None or average_authors < 1:
        raise AssertionError("Average authors per authored paper must be at least 1.")

    if median_authors is None or median_authors < 1:
        raise AssertionError("Median authors per authored paper must be at least 1.")

    if maximum_authors is None or maximum_authors < 1:
        raise AssertionError("Maximum authors per authored paper must be at least 1.")

    if maximum_authors < average_authors:
        raise AssertionError(
            "Maximum authors per paper cannot be less than the average."
        )

    classified_papers = result["single_author_papers"] + result["multi_author_papers"]

    if classified_papers != result["authored_paper_count"]:
        raise AssertionError(
            "Single-author and multi-author counts do not sum "
            "to the number of papers represented in paper_authors. "
            f"expected={result['authored_paper_count']}, "
            f"actual={classified_papers}"
        )

    LOGGER.info(
        "PASS: Author collaboration statistics are valid for %d authored papers.",
        result["authored_paper_count"],
    )

    if result["papers_without_authors"] > 0:
        LOGGER.warning(
            "%d fact papers have no author relationships and are "
            "excluded from collaboration statistics.",
            result["papers_without_authors"],
        )


def validate_author_statistics_reconciliation() -> None:
    """Recalculate collaboration metrics independently."""

    result = fetch_one(
        """
        with author_counts as (
            select
                paper_id,
                count(*) as author_count
            from paper_authors
            group by paper_id
        ),

        expected as (
            select
                round(
                    avg(author_count)::numeric,
                    2
                ) as expected_average,

                percentile_cont(0.5)
                within group (
                    order by author_count
                ) as expected_median,

                max(author_count) as expected_maximum,

                count(*) filter (
                    where author_count = 1
                ) as expected_single,

                count(*) filter (
                    where author_count > 1
                ) as expected_multi

            from author_counts
        )

        select
            expected.expected_average,
            expected.expected_median,
            expected.expected_maximum,
            expected.expected_single,
            expected.expected_multi,

            actual.average_authors_per_paper as actual_average,
            actual.median_authors_per_paper as actual_median,
            actual.maximum_authors_per_paper as actual_maximum,
            actual.single_author_papers as actual_single,
            actual.multi_author_papers as actual_multi

        from expected
        cross join vw_author_statistics actual;
        """
    )

    if result is None:
        raise AssertionError("Author-statistics reconciliation returned no result.")

    checks = (
        (
            "average authors per paper",
            result["expected_average"],
            result["actual_average"],
        ),
        (
            "median authors per paper",
            result["expected_median"],
            result["actual_median"],
        ),
        (
            "maximum authors per paper",
            result["expected_maximum"],
            result["actual_maximum"],
        ),
        (
            "single-author papers",
            result["expected_single"],
            result["actual_single"],
        ),
        (
            "multi-author papers",
            result["expected_multi"],
            result["actual_multi"],
        ),
    )

    for metric_name, expected, actual in checks:
        if expected != actual:
            raise AssertionError(
                f"Incorrect {metric_name}. expected={expected}, actual={actual}"
            )

    LOGGER.info("PASS: Author collaboration statistics reconcile with paper_authors.")


## PHASE H: DASHBOARD ##
## KPIS ##
def validate_dashboard_kpis() -> None:
    """Validate the dashboard KPI summary view."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from vw_dashboard_kpis
            ) as row_count,

            dashboard.total_papers,
            dashboard.papers_published_today,
            dashboard.papers_published_this_week,
            dashboard.papers_published_this_month,

            (
                select total_papers
                from vw_total_papers
            ) as expected_total_papers,

            (
                select papers_published_today
                from vw_papers_published_today
            ) as expected_today,

            (
                select papers_published_this_week
                from vw_papers_published_this_week
            ) as expected_week,

            (
                select papers_published_this_month
                from vw_papers_published_this_month
            ) as expected_month,

            dashboard.top_topic_id,
            dashboard.top_topic_paper_count,

            (
                select topic_id
                from vw_top_topic
            ) as expected_top_topic_id,

            (
                select paper_count
                from vw_top_topic
            ) as expected_top_topic_count,

            dashboard.top_category_id,
            dashboard.top_category_paper_count,

            (
                select category_id
                from vw_top_category
            ) as expected_top_category_id,

            (
                select paper_count
                from vw_top_category
            ) as expected_top_category_count,

            dashboard.top_author_id,
            dashboard.top_author_paper_count,

            (
                select author_id
                from vw_top_author
            ) as expected_top_author_id,

            (
                select paper_count
                from vw_top_author
            ) as expected_top_author_count,

            dashboard.latest_etl_run_id,

            (
                select run_id
                from vw_latest_etl_run
            ) as expected_latest_etl_run_id

        from vw_dashboard_kpis dashboard;
        """
    )

    if result is None:
        raise AssertionError("Dashboard KPI validation returned no result.")

    if result["row_count"] != 1:
        raise AssertionError("vw_dashboard_kpis must return exactly one row.")

    checks = (
        (
            "total papers",
            result["expected_total_papers"],
            result["total_papers"],
        ),
        (
            "papers published today",
            result["expected_today"],
            result["papers_published_today"],
        ),
        (
            "papers published this week",
            result["expected_week"],
            result["papers_published_this_week"],
        ),
        (
            "papers published this month",
            result["expected_month"],
            result["papers_published_this_month"],
        ),
        (
            "top topic ID",
            result["expected_top_topic_id"],
            result["top_topic_id"],
        ),
        (
            "top topic count",
            result["expected_top_topic_count"],
            result["top_topic_paper_count"],
        ),
        (
            "top category ID",
            result["expected_top_category_id"],
            result["top_category_id"],
        ),
        (
            "top category count",
            result["expected_top_category_count"],
            result["top_category_paper_count"],
        ),
        (
            "top author ID",
            result["expected_top_author_id"],
            result["top_author_id"],
        ),
        (
            "top author count",
            result["expected_top_author_count"],
            result["top_author_paper_count"],
        ),
        (
            "latest ETL run",
            result["expected_latest_etl_run_id"],
            result["latest_etl_run_id"],
        ),
    )

    for metric_name, expected, actual in checks:
        if expected != actual:
            raise AssertionError(
                f"Incorrect dashboard {metric_name}. "
                f"expected={expected}, actual={actual}"
            )

    LOGGER.info("PASS: vw_dashboard_kpis returns one correctly reconciled KPI row.")


## LATEST-PAPERS ##
def validate_latest_papers_view() -> None:
    """Validate latest-papers grain and aggregated fields."""

    result = fetch_one(
        """
        select
            (
                select count(*)
                from fact_papers
            ) as expected_paper_count,

            (
                select count(*)
                from vw_latest_papers
            ) as actual_paper_count,

            (
                select count(*)
                from (
                    select paper_id
                    from vw_latest_papers
                    group by paper_id
                    having count(*) > 1
                ) duplicate_papers
            ) as duplicate_paper_count,

            (
                select count(*)
                from vw_latest_papers
                where authors is null
                   or categories is null
                   or topics is null
                   or author_count < 0
                   or category_count < 0
                   or topic_count < 0
            ) as invalid_row_count;
        """
    )

    if result is None:
        raise AssertionError("Latest-papers validation returned no result.")

    if result["expected_paper_count"] != result["actual_paper_count"]:
        raise AssertionError(
            "vw_latest_papers does not contain one row per paper. "
            f"expected={result['expected_paper_count']}, "
            f"actual={result['actual_paper_count']}"
        )

    if result["duplicate_paper_count"] != 0:
        raise AssertionError("vw_latest_papers contains duplicate paper rows.")

    if result["invalid_row_count"] != 0:
        raise AssertionError("vw_latest_papers contains null arrays or invalid counts.")

    LOGGER.info(
        "PASS: vw_latest_papers contains %d valid unique papers.",
        result["actual_paper_count"],
    )


## MAIN RUN FUNCTION ##
def run_validation() -> None:
    """Run analytics infrastructure and view validations."""

    LOGGER.info("Starting analytics validation.")

    validate_sql_files()
    validate_database_connection()
    validate_warehouse_tables()
    validate_analytics_views()

    # Phase B
    validate_paper_details_grain()
    validate_relationship_view_counts()

    # Phase C
    validate_single_row_kpi_views()
    validate_total_papers_kpi()
    validate_publication_period_kpis()
    validate_top_topic_kpi()
    validate_top_category_kpi()
    validate_top_author_kpi()
    validate_latest_etl_run_kpi()

    # Phase D
    validate_time_series_totals()
    validate_time_series_unique_periods()
    validate_cumulative_paper_counts()
    validate_week_start_dates()

    # Phase E: topic analytics
    validate_topic_distribution()
    validate_topic_distribution_counts()
    validate_topic_weekly_trends()
    validate_topic_growth()

    # Phase F: category analytics
    validate_category_distribution()
    validate_category_distribution_counts()
    validate_primary_category_distribution()
    validate_category_weekly_trends()
    validate_category_growth()
    validate_category_topic_matrix()

    # Phase G: author analytics
    validate_author_rankings()
    validate_author_ranking_counts()
    validate_author_topic_specialization()
    validate_author_statistics()
    validate_author_statistics_reconciliation()

    # Phase H: dashboard views
    validate_dashboard_kpis()
    validate_latest_papers_view()

    LOGGER.info("Analytics validation completed successfully.")


def main() -> None:
    """Run validation from the command line."""

    configure_logging()

    try:
        run_validation()
    except Exception:
        LOGGER.exception("Analytics validation failed.")
        raise


if __name__ == "__main__":
    main()
