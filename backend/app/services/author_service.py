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


def search_authors(
    query: str | None = None,
    topic: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Search authors by name and research topic."""

    return fetch_all(
        """
        select
            a.author_id,
            a.author_name,
            a.paper_count,
            a.latest_publication_date,
            a.distinct_topic_count,
            a.distinct_category_count,
            t.paper_count as matching_topic_paper_count
        from vw_author_rankings a
        left join vw_author_topic_specialization t
            on a.author_id = t.author_id
            and lower(t.topic_name) = lower(%s)
        where
            (%s is null or a.author_name ilike '%%' || %s || '%%')
            and (%s is null or t.author_id is not null)
        order by
            case
                when %s is not null then t.paper_count
                else a.paper_count
            end desc nulls last,
            a.author_name asc
        limit %s
        offset %s;
        """,
        (
            topic,
            query,
            query,
            topic,
            topic,
            limit,
            offset,
        ),
    )

def get_author_papers(
    author_id: int,
    topic: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Return an author's publications with optional topic filtering."""

    return fetch_all(
        """
        select
            p.paper_id,
            p.title,
            p.abstract,
            p.primary_category,
            p.published_date,
            p.updated_date,
            p.arxiv_url,
            p.pdf_url,

            coalesce(
                (
                    select array_agg(
                        distinct t.topic_name
                        order by t.topic_name
                    )
                    from paper_topics pt
                    join dim_topic t
                        on pt.topic_id = t.topic_id
                    where pt.paper_id = p.paper_id
                ),
                array[]::text[]
            ) as topics

        from paper_authors pa

        join fact_papers p
            on pa.paper_id = p.paper_id

        where
            pa.author_id = %s

            and (
                %s is null
                or exists (
                    select 1
                    from paper_topics pt_filter
                    join dim_topic t_filter
                        on pt_filter.topic_id = t_filter.topic_id
                    where
                        pt_filter.paper_id = p.paper_id
                        and lower(t_filter.topic_name) = lower(%s)
                )
            )

        order by
            p.published_date desc,
            p.paper_id asc

        limit %s
        offset %s;
        """,
        (
            author_id,
            topic,
            topic,
            limit,
            offset,
        ),
    )

def count_authors(
    query: str | None = None,
    topic: str | None = None,
) -> int:
    """Count authors matching the selected search filters."""

    result = fetch_one(
        """
        select count(*) as total
        from vw_author_rankings a
        where
            (%s::text is null or a.author_name ilike '%%' || %s || '%%')
            and (
                %s::text is null
                or exists (
                    select 1
                    from vw_author_topic_specialization t
                    where t.author_id = a.author_id
                      and lower(t.topic_name) = lower(%s)
                )
            );
        """,
        (query, query, topic, topic),
    )

    return int(result["total"]) if result else 0

def get_author_by_id(author_id: int) -> dict | None:
    """Retrieve an author's summary by ID."""

    return fetch_one(
        """
        select
            author_id,
            author_name,
            paper_count,
            latest_publication_date,
            distinct_topic_count,
            distinct_category_count
        from vw_author_rankings
        where author_id = %s;
        """,
        (author_id,),
    )