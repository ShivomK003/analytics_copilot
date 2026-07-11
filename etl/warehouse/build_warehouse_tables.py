import logging

import pandas as pd

from etl.config import CLEAN_DIR, WAREHOUSE_DIR

CLEAN_PATH = CLEAN_DIR / "arxiv_papers_clean.csv"


def split_csv_values(value: object) -> list[str]:
    if pd.isna(value) or str(value).strip() == "":
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _assert_no_duplicates(df: pd.DataFrame, columns: list[str], label: str) -> None:
    duplicates = df.duplicated(subset=columns).sum()
    if duplicates:
        joined = ", ".join(columns)
        raise ValueError(f"{label} contains {int(duplicates)} duplicate rows on {joined}")


def _assert_foreign_keys(
    bridge_df: pd.DataFrame,
    fact_df: pd.DataFrame,
    dimension_df: pd.DataFrame,
    dimension_key: str,
    label: str,
) -> None:
    fact_ids = set(fact_df["paper_id"])
    bridge_fact_ids = set(bridge_df["paper_id"])
    if not bridge_fact_ids.issubset(fact_ids):
        raise ValueError(f"{label} contains paper_id values missing from fact_papers")

    dimension_ids = set(dimension_df[dimension_key])
    bridge_dimension_ids = set(bridge_df[dimension_key])
    if not bridge_dimension_ids.issubset(dimension_ids):
        raise ValueError(f"{label} contains IDs missing from {dimension_key}")


def build_warehouse_tables(logger: logging.Logger | None = None) -> dict[str, int]:
    active_logger = logger or logging.getLogger("etl")
    df = pd.read_csv(CLEAN_PATH)

    fact_papers = df[
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
        ]
    ].copy()
    _assert_no_duplicates(fact_papers, ["paper_id"], "fact_papers")

    author_rows: list[dict[str, object]] = []
    category_rows: list[dict[str, object]] = []
    topic_rows: list[dict[str, object]] = []

    for _, row in df.iterrows():
        for author in split_csv_values(row["authors"]):
            author_rows.append({"paper_id": row["paper_id"], "author_name": author})
        for category in split_csv_values(row["all_categories"]):
            category_rows.append({"paper_id": row["paper_id"], "category_code": category})
        for topic in split_csv_values(row["detected_topics"]):
            topic_rows.append({"paper_id": row["paper_id"], "topic_name": topic})

    dim_author = (
        pd.DataFrame(sorted({row["author_name"] for row in author_rows}), columns=["author_name"])
        if author_rows
        else pd.DataFrame(columns=["author_name"])
    )
    dim_author["author_id"] = range(1, len(dim_author) + 1)
    _assert_no_duplicates(dim_author, ["author_name"], "dim_author")

    dim_category = (
        pd.DataFrame(sorted({row["category_code"] for row in category_rows}), columns=["category_code"])
        if category_rows
        else pd.DataFrame(columns=["category_code"])
    )
    dim_category["category_id"] = range(1, len(dim_category) + 1)
    _assert_no_duplicates(dim_category, ["category_code"], "dim_category")

    dim_topic = (
        pd.DataFrame(sorted({row["topic_name"] for row in topic_rows}), columns=["topic_name"])
        if topic_rows
        else pd.DataFrame(columns=["topic_name"])
    )
    dim_topic["topic_id"] = range(1, len(dim_topic) + 1)
    _assert_no_duplicates(dim_topic, ["topic_name"], "dim_topic")

    paper_authors = pd.DataFrame(author_rows)
    if not paper_authors.empty:
        paper_authors = paper_authors.merge(dim_author, on="author_name", how="left")[
            ["paper_id", "author_id"]
        ].drop_duplicates()
    else:
        paper_authors = pd.DataFrame(columns=["paper_id", "author_id"])

    paper_categories = pd.DataFrame(category_rows)
    if not paper_categories.empty:
        paper_categories = paper_categories.merge(dim_category, on="category_code", how="left")[
            ["paper_id", "category_id"]
        ].drop_duplicates()
    else:
        paper_categories = pd.DataFrame(columns=["paper_id", "category_id"])

    paper_topics = pd.DataFrame(topic_rows)
    if not paper_topics.empty:
        paper_topics = paper_topics.merge(dim_topic, on="topic_name", how="left")[
            ["paper_id", "topic_id"]
        ].drop_duplicates()
    else:
        paper_topics = pd.DataFrame(columns=["paper_id", "topic_id"])

    _assert_no_duplicates(paper_authors, ["paper_id", "author_id"], "paper_authors")
    _assert_no_duplicates(paper_categories, ["paper_id", "category_id"], "paper_categories")
    _assert_no_duplicates(paper_topics, ["paper_id", "topic_id"], "paper_topics")

    _assert_foreign_keys(paper_authors, fact_papers, dim_author, "author_id", "paper_authors")
    _assert_foreign_keys(
        paper_categories, fact_papers, dim_category, "category_id", "paper_categories"
    )
    _assert_foreign_keys(paper_topics, fact_papers, dim_topic, "topic_id", "paper_topics")

    fact_papers.to_csv(WAREHOUSE_DIR / "fact_papers.csv", index=False)
    dim_author.to_csv(WAREHOUSE_DIR / "dim_author.csv", index=False)
    dim_category.to_csv(WAREHOUSE_DIR / "dim_category.csv", index=False)
    dim_topic.to_csv(WAREHOUSE_DIR / "dim_topic.csv", index=False)
    paper_authors.to_csv(WAREHOUSE_DIR / "paper_authors.csv", index=False)
    paper_categories.to_csv(WAREHOUSE_DIR / "paper_categories.csv", index=False)
    paper_topics.to_csv(WAREHOUSE_DIR / "paper_topics.csv", index=False)

    metrics = {
        "fact_papers": int(len(fact_papers)),
        "dim_author": int(len(dim_author)),
        "dim_category": int(len(dim_category)),
        "dim_topic": int(len(dim_topic)),
        "paper_authors": int(len(paper_authors)),
        "paper_categories": int(len(paper_categories)),
        "paper_topics": int(len(paper_topics)),
    }
    active_logger.info("Saved warehouse CSVs to %s", WAREHOUSE_DIR)
    return metrics


def main() -> None:
    build_warehouse_tables()


if __name__ == "__main__":
    main()
