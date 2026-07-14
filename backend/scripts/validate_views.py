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
    # Base analytical views
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


def run_validation() -> None:
    """Run all Phase A analytics validations."""

    LOGGER.info("Starting analytics infrastructure validation.")

    validate_sql_files()
    validate_database_connection()
    validate_warehouse_tables()
    validate_analytics_views()

    LOGGER.info("Analytics infrastructure validation completed successfully.")


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
