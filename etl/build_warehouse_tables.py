from pathlib import Path
import pandas as pd

CLEAN_PATH = Path("data/clean/arxiv_papers_clean.csv")
WAREHOUSE_DIR = Path("data/warehouse")
WAREHOUSE_DIR.mkdir(parents=True, exist_ok=True)


def split_csv_values(value):
    if pd.isna(value) or str(value).strip() == "":
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def main():
    df = pd.read_csv(CLEAN_PATH)

    # Fact table
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

    # Authors dimension + bridge
    author_rows = []
    paper_author_rows = []

    for _, row in df.iterrows():
        authors = split_csv_values(row["authors"])
        for author in authors:
            author_rows.append({"author_name": author})
            paper_author_rows.append(
                {
                    "paper_id": row["paper_id"],
                    "author_name": author,
                }
            )

    dim_author = pd.DataFrame(author_rows).drop_duplicates().reset_index(drop=True)
    dim_author["author_id"] = dim_author.index + 1

    paper_authors = pd.DataFrame(paper_author_rows)
    paper_authors = paper_authors.merge(dim_author, on="author_name", how="left")
    paper_authors = paper_authors[["paper_id", "author_id"]].drop_duplicates()

    # Categories dimension + bridge
    category_rows = []
    paper_category_rows = []

    for _, row in df.iterrows():
        categories = split_csv_values(row["all_categories"])
        for category in categories:
            category_rows.append({"category_code": category})
            paper_category_rows.append(
                {
                    "paper_id": row["paper_id"],
                    "category_code": category,
                }
            )

    dim_category = pd.DataFrame(category_rows).drop_duplicates().reset_index(drop=True)
    dim_category["category_id"] = dim_category.index + 1

    paper_categories = pd.DataFrame(paper_category_rows)
    paper_categories = paper_categories.merge(
        dim_category, on="category_code", how="left"
    )
    paper_categories = paper_categories[["paper_id", "category_id"]].drop_duplicates()

    # Topics dimension + bridge
    topic_rows = []
    paper_topic_rows = []

    for _, row in df.iterrows():
        topics = split_csv_values(row["detected_topics"])
        for topic in topics:
            topic_rows.append({"topic_name": topic})
            paper_topic_rows.append(
                {
                    "paper_id": row["paper_id"],
                    "topic_name": topic,
                }
            )

    dim_topic = pd.DataFrame(topic_rows).drop_duplicates().reset_index(drop=True)
    dim_topic["topic_id"] = dim_topic.index + 1

    paper_topics = pd.DataFrame(paper_topic_rows)
    paper_topics = paper_topics.merge(dim_topic, on="topic_name", how="left")
    paper_topics = paper_topics[["paper_id", "topic_id"]].drop_duplicates()

    # Save outputs
    fact_papers.to_csv(WAREHOUSE_DIR / "fact_papers.csv", index=False)
    dim_author.to_csv(WAREHOUSE_DIR / "dim_author.csv", index=False)
    paper_authors.to_csv(WAREHOUSE_DIR / "paper_authors.csv", index=False)
    dim_category.to_csv(WAREHOUSE_DIR / "dim_category.csv", index=False)
    paper_categories.to_csv(WAREHOUSE_DIR / "paper_categories.csv", index=False)
    dim_topic.to_csv(WAREHOUSE_DIR / "dim_topic.csv", index=False)
    paper_topics.to_csv(WAREHOUSE_DIR / "paper_topics.csv", index=False)

    print("Warehouse tables created:")
    print("fact_papers:", fact_papers.shape)
    print("dim_author:", dim_author.shape)
    print("paper_authors:", paper_authors.shape)
    print("dim_category:", dim_category.shape)
    print("paper_categories:", paper_categories.shape)
    print("dim_topic:", dim_topic.shape)
    print("paper_topics:", paper_topics.shape)


if __name__ == "__main__":
    main()
