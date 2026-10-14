"""Service functions for paper discovery and analytics."""

from datetime import date
from typing import Any

from app.db import fetch_all, fetch_one


def build_paper_filters(
    query: str | None = None,
    topic: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[str, list[Any]]:
    """Build reusable SQL filters for paper search and count."""

    conditions: list[str] = []
    params: list[Any] = []

    if query:
        conditions.append(
            """
            to_tsvector(
                'english',
                coalesce(p.title, '') || ' ' || coalesce(p.abstract, '')
            ) @@ plainto_tsquery('english', %s)
            """
        )
        params.append(query)

    if topic:
        conditions.append(
            """
            exists (
                select 1
                from paper_topics pt
                join dim_topic t
                    on pt.topic_id = t.topic_id
                where pt.paper_id = p.paper_id
                  and lower(t.topic_name) = lower(%s)
            )
            """
        )
        params.append(topic)

    if category:
        conditions.append(
            """
            exists (
                select 1
                from paper_categories pc
                join dim_category c
                    on pc.category_id = c.category_id
                where pc.paper_id = p.paper_id
                  and lower(c.category_code) = lower(%s)
            )
            """
        )
        params.append(category)

    if date_from:
        conditions.append("p.published_date >= %s")
        params.append(date_from)

    if date_to:
        conditions.append(
            "p.published_date < (%s::date + interval '1 day')"
        )
        params.append(date_to)

    where_clause = (
        "where " + " and ".join(conditions)
        if conditions
        else ""
    )

    return where_clause, params


def search_papers(
    query: str | None = None,
    topic: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: str = "newest",
    limit: int = 10,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Search indexed papers using optional filters."""

    where_clause, params = build_paper_filters(
        query=query,
        topic=topic,
        category=category,
        date_from=date_from,
        date_to=date_to,
    )

    if sort == "oldest":
        order_clause = "p.published_date asc nulls last"

    elif sort == "relevance" and query:
        order_clause = """
            ts_rank(
                to_tsvector(
                    'english',
                    coalesce(p.title, '') || ' ' || coalesce(p.abstract, '')
                ),
                plainto_tsquery('english', %s)
            ) desc,
            p.published_date desc nulls last
        """
        params.append(query)

    else:
        order_clause = "p.published_date desc nulls last"

    params.extend([limit, offset])

    return fetch_all(
        f"""
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

        from fact_papers p

        {where_clause}

        order by
            {order_clause},
            p.paper_id asc

        limit %s
        offset %s;
        """,
        tuple(params),
    )


def count_papers(
    query: str | None = None,
    topic: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> int:
    """Count papers matching the selected search filters."""

    where_clause, params = build_paper_filters(
        query=query,
        topic=topic,
        category=category,
        date_from=date_from,
        date_to=date_to,
    )

    result = fetch_one(
        f"""
        select count(*) as total
        from fact_papers p
        {where_clause};
        """,
        tuple(params),
    )

    return int(result["total"]) if result else 0


def get_paper_by_id(
    paper_id: str,
) -> dict[str, Any] | None:
    """Retrieve full details for a single paper."""

    return fetch_one(
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
            p.year,
            p.month,
            p.week,

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
            ) as topics,

            coalesce(
                (
                    select array_agg(
                        distinct c.category_code
                        order by c.category_code
                    )
                    from paper_categories pc
                    join dim_category c
                        on pc.category_id = c.category_id
                    where pc.paper_id = p.paper_id
                ),
                array[]::text[]
            ) as categories

        from fact_papers p
        where p.paper_id = %s;
        """,
        (paper_id,),
    )


def get_paper_authors(
    paper_id: str,
) -> list[dict[str, Any]]:
    """Retrieve authors associated with a paper."""

    return fetch_all(
        """
        select
            a.author_id,
            a.author_name
        from paper_authors pa
        join dim_author a
            on pa.author_id = a.author_id
        where pa.paper_id = %s
        order by a.author_name asc;
        """,
        (paper_id,),
    )


def get_related_papers(
    paper_id: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Find papers sharing research topics with the selected paper."""

    return fetch_all(
        """
        with target_topics as (
            select distinct topic_id
            from paper_topics
            where paper_id = %s
        ),

        related_candidates as (
            select
                pt.paper_id,
                count(distinct pt.topic_id) as shared_topic_count
            from paper_topics pt
            join target_topics tt
                on pt.topic_id = tt.topic_id
            where pt.paper_id <> %s
            group by pt.paper_id
        )

        select
            p.paper_id,
            p.title,
            p.abstract,
            p.primary_category,
            p.published_date,
            p.arxiv_url,
            p.pdf_url,
            rc.shared_topic_count

        from related_candidates rc
        join fact_papers p
            on rc.paper_id = p.paper_id

        order by
            rc.shared_topic_count desc,
            p.published_date desc nulls last,
            p.paper_id asc

        limit %s;
        """,
        (paper_id, paper_id, limit),
    )