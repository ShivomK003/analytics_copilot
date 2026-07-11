import logging
from collections.abc import Iterable

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

from etl.config import WAREHOUSE_DIR, get_database_config

FACT_COLUMNS = [
    "paper_id",
    "title",
    "abstract",
    "primary_category",
    "published_date",
    "updated_date",
    "pdf_url",
    "arxiv_url",
    "year",
    "month",
    "week",
]


def get_conn():
    return psycopg2.connect(**get_database_config())


def _read_warehouse_csv(file_name: str) -> pd.DataFrame:
    df = pd.read_csv(WAREHOUSE_DIR / file_name)
    return df.where(pd.notnull(df), None)


def get_existing_paper_ids(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("select paper_id from fact_papers;")
        return {row[0] for row in cur.fetchall()}


def _execute_values_if_rows(conn, query: str, rows: Iterable[tuple], page_size: int = 500) -> int:
    materialized_rows = list(rows)
    if not materialized_rows:
        return 0

    with conn.cursor() as cur:
        execute_values(cur, query, materialized_rows, page_size=page_size)
    return len(materialized_rows)


def _insert_fact_papers(conn, fact_df: pd.DataFrame, new_paper_ids: set[str]) -> int:
    new_fact_df = fact_df[fact_df["paper_id"].isin(new_paper_ids)].copy()
    rows = [tuple(row[column] for column in FACT_COLUMNS) for _, row in new_fact_df.iterrows()]
    query = """
        insert into fact_papers (
            paper_id, title, abstract, primary_category, published_date, updated_date,
            pdf_url, arxiv_url, year, month, week
        )
        values %s
        on conflict do nothing;
    """
    return _execute_values_if_rows(conn, query, rows)


def _upsert_dimensions_with_ids(
    conn,
    values: list[str],
    table_name: str,
    id_column: str,
    natural_key_column: str,
) -> None:
    unique_values = sorted({value for value in values if value})
    if not unique_values:
        return

    query = f"""
        with incoming ({natural_key_column}) as (
            values %s
        ),
        missing as (
            select i.{natural_key_column}
            from incoming i
            left join {table_name} t
              on t.{natural_key_column} = i.{natural_key_column}
            where t.{natural_key_column} is null
        ),
        numbered as (
            select
                {natural_key_column},
                row_number() over (order by {natural_key_column}) as row_num
            from missing
        ),
        max_id as (
            select coalesce(max({id_column}), 0) as current_max from {table_name}
        )
        insert into {table_name} ({id_column}, {natural_key_column})
        select max_id.current_max + numbered.row_num, numbered.{natural_key_column}
        from numbered
        cross join max_id
        on conflict ({natural_key_column}) do nothing;
    """
    rows = [(value,) for value in unique_values]
    _execute_values_if_rows(conn, query, rows)


def _fetch_dimension_mapping(conn, table_name: str, id_column: str, natural_key_column: str) -> dict[str, int]:
    with conn.cursor() as cur:
        cur.execute(f"select {natural_key_column}, {id_column} from {table_name};")
        return {row[0]: row[1] for row in cur.fetchall()}


def _insert_bridge_rows(
    conn,
    bridge_df: pd.DataFrame,
    bridge_table: str,
    dimension_mapping: dict[str, int],
    natural_key_column: str,
    id_column: str,
) -> int:
    rows = []
    for _, row in bridge_df.iterrows():
        natural_key = row[natural_key_column]
        if natural_key not in dimension_mapping:
            raise KeyError(f"Missing database mapping for {bridge_table} value {natural_key}")
        rows.append((row["paper_id"], dimension_mapping[natural_key]))

    query = f"""
        insert into {bridge_table} (paper_id, {id_column})
        values %s
        on conflict do nothing;
    """
    return _execute_values_if_rows(conn, query, rows)


def load_to_supabase(logger: logging.Logger | None = None) -> dict[str, int]:
    active_logger = logger or logging.getLogger("etl")

    fact_df = _read_warehouse_csv("fact_papers.csv")
    dim_author_df = _read_warehouse_csv("dim_author.csv")
    dim_category_df = _read_warehouse_csv("dim_category.csv")
    dim_topic_df = _read_warehouse_csv("dim_topic.csv")

    paper_authors_df = _read_warehouse_csv("paper_authors.csv").merge(
        dim_author_df, on="author_id", how="left"
    )
    paper_categories_df = _read_warehouse_csv("paper_categories.csv").merge(
        dim_category_df, on="category_id", how="left"
    )
    paper_topics_df = _read_warehouse_csv("paper_topics.csv").merge(
        dim_topic_df, on="topic_id", how="left"
    )

    conn = get_conn()
    try:
        existing_paper_ids = get_existing_paper_ids(conn)
        warehouse_paper_ids = set(fact_df["paper_id"].tolist())
        new_paper_ids = warehouse_paper_ids - existing_paper_ids

        papers_available = int(len(fact_df))
        duplicates_skipped = int(papers_available - len(new_paper_ids))

        _insert_fact_papers(conn, fact_df, new_paper_ids)

        _upsert_dimensions_with_ids(
            conn,
            dim_author_df["author_name"].dropna().tolist(),
            "dim_author",
            "author_id",
            "author_name",
        )
        _upsert_dimensions_with_ids(
            conn,
            dim_category_df["category_code"].dropna().tolist(),
            "dim_category",
            "category_id",
            "category_code",
        )
        _upsert_dimensions_with_ids(
            conn,
            dim_topic_df["topic_name"].dropna().tolist(),
            "dim_topic",
            "topic_id",
            "topic_name",
        )

        author_mapping = _fetch_dimension_mapping(
            conn, "dim_author", "author_id", "author_name"
        )
        category_mapping = _fetch_dimension_mapping(
            conn, "dim_category", "category_id", "category_code"
        )
        topic_mapping = _fetch_dimension_mapping(conn, "dim_topic", "topic_id", "topic_name")

        filtered_authors = paper_authors_df[paper_authors_df["paper_id"].isin(new_paper_ids)].copy()
        filtered_categories = paper_categories_df[
            paper_categories_df["paper_id"].isin(new_paper_ids)
        ].copy()
        filtered_topics = paper_topics_df[paper_topics_df["paper_id"].isin(new_paper_ids)].copy()

        _insert_bridge_rows(
            conn,
            filtered_authors,
            "paper_authors",
            author_mapping,
            "author_name",
            "author_id",
        )
        _insert_bridge_rows(
            conn,
            filtered_categories,
            "paper_categories",
            category_mapping,
            "category_code",
            "category_id",
        )
        _insert_bridge_rows(
            conn,
            filtered_topics,
            "paper_topics",
            topic_mapping,
            "topic_name",
            "topic_id",
        )

        conn.commit()

        metrics = {
            "papers_available": papers_available,
            "new_papers_loaded": int(len(new_paper_ids)),
            "duplicates_skipped": duplicates_skipped,
            "existing_papers": int(len(existing_paper_ids)),
        }
        active_logger.info(
            "Incremental load complete: %s new papers, %s duplicates skipped",
            metrics["new_papers_loaded"],
            metrics["duplicates_skipped"],
        )
        return metrics
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main() -> None:
    load_to_supabase()


if __name__ == "__main__":
    main()
