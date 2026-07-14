"""Service functions for dashboard-ready analytics."""

from __future__ import annotations

from typing import Any

from app.db import fetch_all, fetch_one


def get_dashboard_kpis() -> dict[str, Any] | None:
    """Return the dashboard KPI summary."""

    return fetch_one(
        """
        select *
        from vw_dashboard_kpis;
        """
    )


def get_latest_papers(
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Return the latest dashboard-ready papers."""

    return fetch_all(
        """
        select
            paper_id,
            title,
            abstract,
            authors,
            primary_category,
            categories,
            topics,
            published_date,
            updated_date,
            pdf_url,
            arxiv_url,
            author_count,
            category_count,
            topic_count
        from vw_latest_papers
        order by
            published_date desc nulls last,
            paper_id desc
        limit %s;
        """,
        (limit,),
    )


def get_dashboard_home(
    latest_paper_limit: int = 10,
    author_limit: int = 10,
) -> dict[str, Any]:
    """
    Return all datasets required by the dashboard homepage.

    This endpoint composes existing validated analytics views. It does
    not define new metric logic.
    """

    kpis = get_dashboard_kpis()

    daily_trend = fetch_all(
        """
        select
            publication_date,
            paper_count
        from vw_daily_paper_counts
        order by publication_date;
        """
    )

    weekly_trend = fetch_all(
        """
        select
            week_start,
            paper_count
        from vw_weekly_paper_counts
        order by week_start;
        """
    )

    topic_distribution = fetch_all(
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

    topic_growth = fetch_all(
        """
        select
            topic_id,
            topic_name,
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

    primary_category_distribution = fetch_all(
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

    category_growth = fetch_all(
        """
        select
            category_id,
            category_code,
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

    top_authors = fetch_all(
        """
        select
            author_id,
            author_name,
            paper_count,
            latest_publication_date,
            distinct_topic_count,
            distinct_category_count
        from vw_author_rankings
        order by
            paper_count desc,
            author_name asc
        limit %s;
        """,
        (author_limit,),
    )

    author_statistics = fetch_one(
        """
        select
            average_authors_per_paper,
            median_authors_per_paper,
            maximum_authors_per_paper,
            single_author_papers,
            multi_author_papers
        from vw_author_statistics;
        """
    )

    latest_papers = get_latest_papers(limit=latest_paper_limit)

    return {
        "kpis": kpis or {},
        "daily_trend": daily_trend,
        "weekly_trend": weekly_trend,
        "topic_distribution": topic_distribution,
        "topic_growth": topic_growth,
        "primary_category_distribution": (primary_category_distribution),
        "category_growth": category_growth,
        "top_authors": top_authors,
        "author_statistics": author_statistics or {},
        "latest_papers": latest_papers,
    }
