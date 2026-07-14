from typing import Any

from app.db import fetch_all


def get_topic_distribution() -> list[dict[str, Any]]:
    """Return topic counts and percentages."""

    return fetch_all(
        """
        select
            topic_id,
            topic_name,
            paper_count,
            percentage_of_tagged_papers
        from vw_topic_distribution
        order by
            paper_count desc,
            topic_name asc;
        """
    )


def get_topic_weekly_trends() -> list[dict[str, Any]]:
    """Return weekly publication counts by topic."""

    return fetch_all(
        """
        select
            week_start,
            topic_id,
            topic_name,
            paper_count
        from vw_topic_weekly_trends
        order by
            week_start,
            paper_count desc,
            topic_name asc;
        """
    )


def get_topic_growth_30d() -> list[dict[str, Any]]:
    """Return topic growth for the latest two 30-day periods."""

    return fetch_all(
        """
        select
            topic_id,
            topic_name,
            current_period_start,
            current_period_end,
            previous_period_start,
            previous_period_end,
            current_30_day_count,
            previous_30_day_count,
            absolute_growth,
            growth_percentage,
            growth_status
        from vw_topic_growth_30d
        order by
            absolute_growth desc,
            current_30_day_count desc,
            topic_name asc;
        """
    )
