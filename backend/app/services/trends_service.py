## TIME SERIES SERVICE QUERIES ##

from typing import Any

from app.db import fetch_all


def get_daily_paper_counts() -> list[dict[str, Any]]:
    """Return daily publication counts."""

    return fetch_all(
        """
        select
            publication_date,
            paper_count
        from vw_daily_paper_counts
        order by publication_date;
        """
    )


def get_weekly_paper_counts() -> list[dict[str, Any]]:
    """Return weekly publication counts."""

    return fetch_all(
        """
        select
            week_start,
            paper_count
        from vw_weekly_paper_counts
        order by week_start;
        """
    )


def get_monthly_paper_counts() -> list[dict[str, Any]]:
    """Return monthly publication counts."""

    return fetch_all(
        """
        select
            month_start,
            paper_count
        from vw_monthly_paper_counts
        order by month_start;
        """
    )


def get_cumulative_paper_counts() -> list[dict[str, Any]]:
    """Return daily and cumulative publication counts."""

    return fetch_all(
        """
        select
            publication_date,
            papers_published,
            cumulative_papers
        from vw_cumulative_paper_counts
        order by publication_date;
        """
    )
