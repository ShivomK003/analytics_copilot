import logging
import time
from urllib.parse import urlencode

import feedparser
import pandas as pd
import requests

from etl.config import ARXIV_CATEGORIES, ARXIV_MAX_RESULTS, RAW_DIR

ARXIV_API_URL = "https://export.arxiv.org/api/query"
OUTPUT_PATH = RAW_DIR / "arxiv_papers_raw.csv"
REQUEST_DELAY_SECONDS = 3


def build_query(category: str, max_results: int = ARXIV_MAX_RESULTS) -> str:
    params = {
        "search_query": f"cat:{category}",
        "start": 0,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }
    return f"{ARXIV_API_URL}?{urlencode(params)}"


def clean_text(text: str) -> str:
    if not text:
        return ""
    return " ".join(str(text).replace("\n", " ").split())


def fetch_category(
    category: str,
    logger: logging.Logger | None = None,
    session: requests.Session | None = None,
) -> list[dict]:
    url = build_query(category)
    active_logger = logger or logging.getLogger("etl")
    client = session or requests.Session()

    active_logger.info("Fetching arXiv category %s", category)

    try:
        response = client.get(url, timeout=30)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to fetch arXiv data for category {category}") from exc

    feed = feedparser.parse(response.text)
    papers: list[dict] = []

    for entry in feed.entries:
        arxiv_url = getattr(entry, "id", "")
        paper_id = arxiv_url.split("/abs/")[-1] if arxiv_url else ""
        authors = [author.name for author in getattr(entry, "authors", [])]
        categories = [tag["term"] for tag in getattr(entry, "tags", [])]

        pdf_url = next(
            (
                link.href
                for link in getattr(entry, "links", [])
                if getattr(link, "type", "") == "application/pdf"
            ),
            arxiv_url.replace("/abs/", "/pdf/") if arxiv_url else "",
        )

        papers.append(
            {
                "paper_id": paper_id,
                "title": clean_text(getattr(entry, "title", "")),
                "abstract": clean_text(getattr(entry, "summary", "")),
                "authors": ", ".join(authors),
                "primary_category": category,
                "all_categories": ", ".join(categories),
                "published_date": getattr(entry, "published", ""),
                "updated_date": getattr(entry, "updated", ""),
                "pdf_url": pdf_url,
                "arxiv_url": arxiv_url,
            }
        )

    active_logger.info("Fetched %s papers for %s", len(papers), category)
    return papers


def extract_arxiv_data(
    logger: logging.Logger | None = None,
    categories: list[str] | None = None,
) -> dict[str, int]:
    active_logger = logger or logging.getLogger("etl")
    selected_categories = categories or ARXIV_CATEGORIES

    all_papers: list[dict] = []
    with requests.Session() as session:
        for index, category in enumerate(selected_categories):
            all_papers.extend(fetch_category(category, logger=active_logger, session=session))
            if index < len(selected_categories) - 1:
                time.sleep(REQUEST_DELAY_SECONDS)

    raw_df = pd.DataFrame(all_papers)
    raw_df.to_csv(OUTPUT_PATH, index=False)

    metrics = {"papers_fetched": int(len(raw_df))}
    active_logger.info("Saved raw arXiv data to %s", OUTPUT_PATH)
    return metrics


def main() -> None:
    extract_arxiv_data()


if __name__ == "__main__":
    main()
