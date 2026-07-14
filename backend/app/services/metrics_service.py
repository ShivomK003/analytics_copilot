"""Service functions for dashboard analytics metrics."""

from typing import Any

from app.db import fetch_all, fetch_one


def get_total_papers() -> int:
    """Return the warehouse paper total from the KPI layer."""

    result = fetch_one(
        """
        select total_papers
        from vw_total_papers;
        """
    )

    return int(result["total_papers"]) if result else 0


def get_publication_kpis() -> dict[str, int]:
    """Return current publication-period KPI values."""

    result = fetch_one(
        """
        select
            today.papers_published_today,
            week.papers_published_this_week,
            month.papers_published_this_month
        from vw_papers_published_today today
        cross join vw_papers_published_this_week week
        cross join vw_papers_published_this_month month;
        """
    )

    if result is None:
        return {
            "papers_published_today": 0,
            "papers_published_this_week": 0,
            "papers_published_this_month": 0,
        }

    return {
        "papers_published_today": int(result["papers_published_today"]),
        "papers_published_this_week": int(result["papers_published_this_week"]),
        "papers_published_this_month": int(result["papers_published_this_month"]),
    }


def get_top_topic() -> dict[str, Any] | None:
    """Return the most common detected topic."""

    return fetch_one(
        """
        select
            topic_id,
            topic_name,
            paper_count
        from vw_top_topic;
        """
    )


def get_top_category() -> dict[str, Any] | None:
    """Return the most common category association."""

    return fetch_one(
        """
        select
            category_id,
            category_code,
            paper_count
        from vw_top_category;
        """
    )


def get_top_author() -> dict[str, Any] | None:
    """Return the most active author in the warehouse dataset."""

    return fetch_one(
        """
        select
            author_id,
            author_name,
            paper_count
        from vw_top_author;
        """
    )


def get_latest_etl_run() -> dict[str, Any] | None:
    """Return the latest recorded ETL run."""

    return fetch_one(
        """
        select *
        from vw_latest_etl_run;
        """
    )


def get_top_topics() -> list[dict[str, Any]]:
    """
    Return the topic ranking.

    This remains a direct aggregate until the full topic analytics
    view is implemented in Phase E.
    """

    return fetch_all(
        """
        select
            topic_id,
            topic_name,
            count(distinct paper_id) as paper_count
        from vw_paper_topics
        group by
            topic_id,
            topic_name
        order by
            paper_count desc,
            topic_name asc;
        """
    )


def get_papers_by_primary_category() -> list[dict[str, Any]]:
    """
    Return primary-category counts.

    The dedicated category analytics views will replace this query
    during the category analytics phase.
    """

    return fetch_all(
        """
        select
            primary_category,
            count(distinct paper_id) as paper_count
        from vw_paper_details
        where primary_category is not null
        group by primary_category
        order by
            paper_count desc,
            primary_category asc;
        """
    )


def get_latest_papers(limit: int = 10) -> list[dict[str, Any]]:
    """
    Return recently published papers.

    A dedicated dashboard view will replace this query later.
    """

    return fetch_all(
        """
        select
            paper_id,
            title,
            primary_category,
            published_date,
            arxiv_url
        from vw_paper_details
        order by
            published_date desc nulls last,
            paper_id desc
        limit %s;
        """,
        (limit,),
    )


def get_dashboard_metrics() -> dict[str, Any]:
    """Return dashboard metrics from the analytics layer."""

    publication_kpis = get_publication_kpis()

    return {
        "total_papers": get_total_papers(),
        **publication_kpis,
        "top_topic": get_top_topic(),
        "top_category": get_top_category(),
        "top_author": get_top_author(),
        "latest_etl_run": get_latest_etl_run(),
        # Existing dashboard datasets retained temporarily.
        "top_topics": get_top_topics(),
        "papers_by_category": get_papers_by_primary_category(),
        "latest_papers": get_latest_papers(limit=10),
    }
