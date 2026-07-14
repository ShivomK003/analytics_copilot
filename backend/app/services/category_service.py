"""Service functions for category analytics."""

from typing import Any

from app.db import fetch_all


def get_category_distribution() -> list[dict[str, Any]]:
    """Return all-category paper counts and percentages."""

    return fetch_all(
        """
        select
            category_id,
            category_code,
            paper_count,
            percentage_of_categorized_papers
        from vw_category_distribution
        order by
            paper_count desc,
            category_code asc;
        """
    )


def get_primary_category_distribution() -> list[dict[str, Any]]:
    """Return primary-category paper counts and percentages."""

    return fetch_all(
        """
        select
            category_code,
            paper_count,
            percentage_of_primary_categorized_papers
        from vw_primary_category_distribution
        order by
            paper_count desc,
            category_code asc;
        """
    )


def get_category_weekly_trends() -> list[dict[str, Any]]:
    """Return weekly paper counts by category."""

    return fetch_all(
        """
        select
            week_start,
            category_id,
            category_code,
            paper_count
        from vw_category_weekly_trends
        order by
            week_start,
            paper_count desc,
            category_code asc;
        """
    )


def get_category_growth_30d() -> list[dict[str, Any]]:
    """Return 30-day category growth metrics."""

    return fetch_all(
        """
        select
            category_id,
            category_code,
            current_period_start,
            current_period_end,
            previous_period_start,
            previous_period_end,
            current_30_day_count,
            previous_30_day_count,
            absolute_growth,
            growth_percentage,
            growth_status
        from vw_category_growth_30d
        order by
            absolute_growth desc,
            current_30_day_count desc,
            category_code asc;
        """
    )


def get_category_topic_matrix() -> list[dict[str, Any]]:
    """Return observed category-topic combinations."""

    return fetch_all(
        """
        select
            category_id,
            category_code,
            topic_id,
            topic_name,
            shared_paper_count
        from vw_category_topic_matrix
        order by
            shared_paper_count desc,
            category_code asc,
            topic_name asc;
        """
    )
