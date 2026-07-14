"""Validate the consolidated dashboard service response."""

from __future__ import annotations

import logging
from typing import Any

from app.services.dashboard_service import get_dashboard_home


LOGGER = logging.getLogger(__name__)

EXPECTED_RESPONSE_KEYS = {
    "kpis",
    "daily_trend",
    "weekly_trend",
    "topic_distribution",
    "topic_growth",
    "primary_category_distribution",
    "category_growth",
    "top_authors",
    "author_statistics",
    "latest_papers",
}


def configure_logging() -> None:
    """Configure console logging."""

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def validate_response_structure(
    response: dict[str, Any],
) -> None:
    """Confirm all expected dashboard sections exist."""

    actual_keys = set(response)
    missing_keys = EXPECTED_RESPONSE_KEYS - actual_keys
    unexpected_keys = actual_keys - EXPECTED_RESPONSE_KEYS

    if missing_keys:
        raise AssertionError(
            "Dashboard response is missing keys: " + ", ".join(sorted(missing_keys))
        )

    if unexpected_keys:
        raise AssertionError(
            "Dashboard response contains unexpected keys: "
            + ", ".join(sorted(unexpected_keys))
        )

    LOGGER.info(
        "PASS: Dashboard response contains all %d expected sections.",
        len(EXPECTED_RESPONSE_KEYS),
    )


def validate_dashboard_kpis(
    response: dict[str, Any],
) -> None:
    """Validate essential KPI fields."""

    kpis = response["kpis"]

    required_kpis = {
        "total_papers",
        "papers_published_today",
        "papers_published_this_week",
        "papers_published_this_month",
        "top_topic_name",
        "top_category_code",
        "top_author_name",
        "latest_etl_status",
    }

    missing_kpis = required_kpis - set(kpis)

    if missing_kpis:
        raise AssertionError(
            "Dashboard KPI response is missing fields: "
            + ", ".join(sorted(missing_kpis))
        )

    non_negative_fields = (
        "total_papers",
        "papers_published_today",
        "papers_published_this_week",
        "papers_published_this_month",
    )

    for field_name in non_negative_fields:
        if kpis[field_name] is None or kpis[field_name] < 0:
            raise AssertionError(f"Dashboard KPI {field_name} must be non-negative.")

    LOGGER.info("PASS: Dashboard KPI payload is valid.")


def validate_collection_limits(
    response: dict[str, Any],
    latest_paper_limit: int,
    author_limit: int,
) -> None:
    """Confirm service limits are respected."""

    if len(response["latest_papers"]) > latest_paper_limit:
        raise AssertionError("Dashboard returned more latest papers than requested.")

    if len(response["top_authors"]) > author_limit:
        raise AssertionError("Dashboard returned more authors than requested.")

    LOGGER.info("PASS: Dashboard collection limits are respected.")


def validate_collection_types(
    response: dict[str, Any],
) -> None:
    """Confirm list and object sections have expected types."""

    list_sections = (
        "daily_trend",
        "weekly_trend",
        "topic_distribution",
        "topic_growth",
        "primary_category_distribution",
        "category_growth",
        "top_authors",
        "latest_papers",
    )

    for section_name in list_sections:
        if not isinstance(response[section_name], list):
            raise AssertionError(f"{section_name} must be a list.")

    if not isinstance(response["kpis"], dict):
        raise AssertionError("kpis must be an object.")

    if not isinstance(response["author_statistics"], dict):
        raise AssertionError("author_statistics must be an object.")

    LOGGER.info("PASS: Dashboard sections have valid response types.")


def run_validation() -> None:
    """Validate the consolidated dashboard service."""

    latest_paper_limit = 10
    author_limit = 10

    LOGGER.info("Starting dashboard API validation.")

    response = get_dashboard_home(
        latest_paper_limit=latest_paper_limit,
        author_limit=author_limit,
    )

    validate_response_structure(response)
    validate_dashboard_kpis(response)
    validate_collection_limits(
        response,
        latest_paper_limit=latest_paper_limit,
        author_limit=author_limit,
    )
    validate_collection_types(response)

    LOGGER.info("Dashboard API validation completed successfully.")


def main() -> None:
    """Run dashboard API validation."""

    configure_logging()

    try:
        run_validation()
    except Exception:
        LOGGER.exception("Dashboard API validation failed.")
        raise


if __name__ == "__main__":
    main()
