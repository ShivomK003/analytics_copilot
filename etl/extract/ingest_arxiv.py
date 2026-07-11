import time
from pathlib import Path
from urllib.parse import urlencode

import feedparser
import pandas as pd
import requests

RAW_DIR = Path("../data/raw")
RAW_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_PATH = RAW_DIR / "arxiv_papers_raw.csv"

ARXIV_API_URL = "https://export.arxiv.org/api/query"

CATEGORIES = [
    "cs.AI",  # Artificial Intelligence
    "cs.LG",  # Machine Learning
    "cs.CL",  # Computation and Language / NLP
    "cs.CV",  # Computer Vision
    "cs.RO",  # Robotics
    "stat.ML",  # Machine Learning Statistics
]

MAX_RESULTS_PER_CATEGORY = 100


def build_query(category: str) -> str:
    params = {
        "search_query": f"cat:{category}",
        "start": 0,
        "max_results": MAX_RESULTS_PER_CATEGORY,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }
    return f"{ARXIV_API_URL}?{urlencode(params)}"


def clean_text(text: str) -> str:
    if not text:
        return ""
    return " ".join(text.replace("\n", " ").split())


def fetch_category(category: str) -> list[dict]:
    url = build_query(category)
    print(f"Fetching {category}...")

    response = requests.get(url, timeout=30)
    response.raise_for_status()

    feed = feedparser.parse(response.text)
    papers = []

    for entry in feed.entries:
        arxiv_id = entry.id.split("/abs/")[-1]

        authors = (
            [author.name for author in entry.authors]
            if hasattr(entry, "authors")
            else []
        )

        categories = []
        if hasattr(entry, "tags"):
            categories = [tag["term"] for tag in entry.tags]

        papers.append(
            {
                "paper_id": arxiv_id,
                "title": clean_text(entry.title),
                "abstract": clean_text(entry.summary),
                "authors": ", ".join(authors),
                "primary_category": category,
                "all_categories": ", ".join(categories),
                "published_date": entry.published,
                "updated_date": entry.updated,
                "pdf_url": entry.link.replace("/abs/", "/pdf/"),
                "arxiv_url": entry.link,
            }
        )

    print(f"Fetched {len(papers)} papers for {category}")
    return papers


def main():
    all_papers = []

    for category in CATEGORIES:
        papers = fetch_category(category)
        all_papers.extend(papers)

        # Be polite to arXiv API.
        time.sleep(3)

    df = pd.DataFrame(all_papers)

    before = len(df)
    df = df.drop_duplicates(subset=["paper_id"])
    after = len(df)

    df.to_csv(OUTPUT_PATH, index=False)

    print("\nDone.")
    print(f"Rows before dedupe: {before}")
    print(f"Rows after dedupe: {after}")
    print(f"Saved to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
