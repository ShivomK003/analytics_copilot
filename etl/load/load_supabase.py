from pathlib import Path
import os
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

ROOT_DIR = Path(__file__).resolve().parents[2]
WAREHOUSE_DIR = ROOT_DIR / "data" / "warehouse"
ENV_PATH = ROOT_DIR / "backend" / ".env"

load_dotenv(ENV_PATH)


def get_conn():
    return psycopg2.connect(
        host=os.getenv("SUPABASE_HOST"),
        port=os.getenv("SUPABASE_PORT"),
        dbname=os.getenv("SUPABASE_DB"),
        user=os.getenv("SUPABASE_USER"),
        password=os.getenv("SUPABASE_PASSWORD"),
    )


def get_existing_paper_ids(conn):
    with conn.cursor() as cur:
        cur.execute("select paper_id from fact_papers;")
        return {row[0] for row in cur.fetchall()}


def load_csv(conn, table_name, csv_name, columns):
    path = WAREHOUSE_DIR / csv_name
    df = pd.read_csv(path)
    df = df.where(pd.notnull(df), None)

    rows = [tuple(row[col] for col in columns) for _, row in df.iterrows()]

    if not rows:
        print(f"No rows to load into {table_name}")
        return 0

    placeholders = ", ".join(columns)

    query = f"""
        insert into {table_name} ({placeholders})
        values %s
        on conflict do nothing;
    """

    with conn.cursor() as cur:
        execute_values(cur, query, rows)

    print(f"Attempted load: {len(rows)} rows into {table_name}")
    return len(rows)


def filter_new_warehouse_data(existing_paper_ids):
    fact_path = WAREHOUSE_DIR / "fact_papers.csv"

    fact_df = pd.read_csv(fact_path)

    total_papers = len(fact_df)

    new_fact_df = fact_df[~fact_df["paper_id"].isin(existing_paper_ids)].copy()

    new_paper_ids = set(new_fact_df["paper_id"])

    duplicates_skipped = total_papers - len(new_fact_df)

    new_fact_df.to_csv(fact_path, index=False)

    bridge_files = [
        "paper_authors.csv",
        "paper_categories.csv",
        "paper_topics.csv",
    ]

    for file_name in bridge_files:
        path = WAREHOUSE_DIR / file_name
        df = pd.read_csv(path)
        df = df[df["paper_id"].isin(new_paper_ids)].copy()
        df.to_csv(path, index=False)

    return total_papers, len(new_fact_df), duplicates_skipped


def verify_counts(conn):
    tables = [
        "fact_papers",
        "dim_author",
        "dim_category",
        "dim_topic",
        "paper_authors",
        "paper_categories",
        "paper_topics",
    ]

    with conn.cursor() as cur:
        print("\nDatabase counts:")
        for table in tables:
            cur.execute(f"select count(*) from {table};")
            print(f"{table}: {cur.fetchone()[0]}")


def main():
    conn = get_conn()

    try:
        existing_paper_ids = get_existing_paper_ids(conn)

        papers_fetched, new_papers_loaded, duplicates_skipped = (
            filter_new_warehouse_data(existing_paper_ids)
        )

        print(f"Papers in warehouse CSV: {papers_fetched}")
        print(f"New papers to load: {new_papers_loaded}")
        print(f"Duplicates skipped: {duplicates_skipped}")

        load_csv(
            conn,
            "fact_papers",
            "fact_papers.csv",
            [
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
            ],
        )

        load_csv(conn, "dim_author", "dim_author.csv", ["author_name", "author_id"])

        load_csv(
            conn,
            "dim_category",
            "dim_category.csv",
            ["category_code", "category_id"],
        )

        load_csv(conn, "dim_topic", "dim_topic.csv", ["topic_name", "topic_id"])

        load_csv(conn, "paper_authors", "paper_authors.csv", ["paper_id", "author_id"])

        load_csv(
            conn,
            "paper_categories",
            "paper_categories.csv",
            ["paper_id", "category_id"],
        )

        load_csv(conn, "paper_topics", "paper_topics.csv", ["paper_id", "topic_id"])

        conn.commit()
        verify_counts(conn)

        return {
            "papers_fetched": papers_fetched,
            "new_papers_loaded": new_papers_loaded,
            "duplicates_skipped": duplicates_skipped,
        }

    except Exception:
        conn.rollback()
        raise

    finally:
        conn.close()


if __name__ == "__main__":
    main()
