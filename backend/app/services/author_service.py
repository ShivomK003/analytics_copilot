"""Service functions for author analytics."""

from typing import Any

from app.db import fetch_all, fetch_one


def get_author_rankings(
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return authors ranked by distinct publication count."""

    return fetch_all(
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
        (limit,),
    )


def get_author_topic_specialization(
    author_id: int | None = None,
) -> list[dict[str, Any]]:
    """Return author-topic publication counts."""

    if author_id is not None:
        return fetch_all(
            """
            select
                author_id,
                author_name,
                topic_id,
                topic_name,
                paper_count
            from vw_author_topic_specialization
            where author_id = %s
            order by
                paper_count desc,
                topic_name asc;
            """,
            (author_id,),
        )

    return fetch_all(
        """
        select
            author_id,
            author_name,
            topic_id,
            topic_name,
            paper_count
        from vw_author_topic_specialization
        order by
            paper_count desc,
            author_name asc,
            topic_name asc;
        """
    )


def get_author_statistics() -> dict[str, Any] | None:
    """Return warehouse-wide collaboration statistics."""

    return fetch_one(
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
