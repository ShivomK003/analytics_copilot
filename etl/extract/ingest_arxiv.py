import logging
import time
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import feedparser
import pandas as pd
import requests

from etl.config import ARXIV_CATEGORIES, ARXIV_MAX_RESULTS, RAW_DIR

ARXIV_API_URL = "https://export.arxiv.org/api/query"
OUTPUT_PATH = RAW_DIR / "arxiv_papers_raw.csv"
REQUEST_DELAY_SECONDS = 3
DEFAULT_TIMEOUT = 90
MAX_RETRIES = 3
INITIAL_RETRY_DELAY_SECONDS = 2
RATE_LIMIT_RETRY_DELAY_SECONDS = 30
ARXIV_USER_AGENT = "AnalyticsCopilot/1.0 (mailto:shivomkarnad@gmail.com)"
RAW_COLUMNS = [
    "paper_id",
    "title",
    "abstract",
    "authors",
    "primary_category",
    "all_categories",
    "published_date",
    "updated_date",
    "pdf_url",
    "arxiv_url",
]


def build_query(
    category: str,
    max_results: int = ARXIV_MAX_RESULTS,
    start: int = 0,
    date_from: str | None = None,
    date_to: str | None = None,
) -> str:
    search_query = f"cat:{category}"

    if date_from and date_to:
        search_query += (
            f" AND submittedDate:[{date_from} TO {date_to}]"
        )

    params = {
        "search_query": search_query,
        "start": start,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "ascending" if date_from and date_to else "descending",
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
    timeout: int = DEFAULT_TIMEOUT,
    start: int = 0,
    date_from: str | None = None,
    date_to: str | None = None,
    max_results: int = ARXIV_MAX_RESULTS,
) -> list[dict]:

    active_logger = logger or logging.getLogger("etl")
    client = session or requests.Session()

    # Reset request metadata before every API call
    fetch_category.last_request_succeeded = False
    fetch_category.last_total_results = -1

    url = build_query(
        category,
        start=start,
        date_from=date_from,
        date_to=date_to,
        max_results=max_results,
    )

    active_logger.info(
        "Fetching arXiv category %s at offset %s",
        category,
        start,
    )

    response: requests.Response | None = None

    # --------------------------------------------------
    # 1. Request arXiv API with retry handling
    # --------------------------------------------------

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = client.get(
                url,
                timeout=timeout,
                headers={"User-Agent": ARXIV_USER_AGENT},
            )

            response.raise_for_status()
            break

        # Handle timeouts and connection errors
        except (
            requests.exceptions.ReadTimeout,
            requests.exceptions.ConnectionError,
        ) as exc:

            if attempt < MAX_RETRIES:
                delay = INITIAL_RETRY_DELAY_SECONDS * (2**attempt)

                active_logger.warning(
                    "Retry %s/%s for category %s due to connection error: %s. "
                    "Waiting %s seconds.",
                    attempt + 1,
                    MAX_RETRIES,
                    category,
                    exc,
                    delay,
                )

                time.sleep(delay)
                continue

            active_logger.error(
                "Skipping category %s after %s failed attempts",
                category,
                MAX_RETRIES + 1,
            )
            return []

        # Handle HTTP errors, including rate limiting
        except requests.exceptions.HTTPError as exc:

            status_code = (
                exc.response.status_code
                if exc.response is not None
                else None
            )

            if status_code == 429 and attempt < MAX_RETRIES:

                retry_after = exc.response.headers.get("Retry-After")

                try:
                    delay = (
                        max(0, float(retry_after))
                        if retry_after
                        else RATE_LIMIT_RETRY_DELAY_SECONDS * (2**attempt)
                    )
                except (ValueError, OverflowError):
                    delay = RATE_LIMIT_RETRY_DELAY_SECONDS * (2**attempt)

                active_logger.warning(
                    "Rate limited by arXiv for category %s (HTTP 429). "
                    "Retry %s/%s in %.1f seconds.",
                    category,
                    attempt + 1,
                    MAX_RETRIES,
                    delay,
                )

                time.sleep(delay)
                continue

            active_logger.error(
                "Skipping category %s after HTTP error %s: %s",
                category,
                status_code,
                exc,
            )
            return []

        # Handle other request errors
        except requests.RequestException as exc:

            active_logger.error(
                "Skipping category %s after request failure: %s",
                category,
                exc,
            )
            return []

    if response is None:
        active_logger.error(
            "Skipping category %s: no response received",
            category,
        )
        return []

    # --------------------------------------------------
    # 2. Parse and validate the arXiv response
    # --------------------------------------------------

    feed = feedparser.parse(response.text)

    if feed.bozo:
        active_logger.error(
            "Invalid arXiv feed for category %s at offset %s",
            category,
            start,
        )
        return []

    # Capture pagination metadata
    try:
        total_results = int(
            feed.feed.get("opensearch_totalresults", -1)
        )

        start_index = int(
            feed.feed.get("opensearch_startindex", -1)
        )

    except (ValueError, TypeError):
        active_logger.error(
            "Invalid pagination metadata for category %s",
            category,
        )
        return []

    if total_results < 0 or start_index != start:
        active_logger.error(
            "Unexpected pagination metadata for %s: "
            "total_results=%s, start_index=%s, expected_start=%s",
            category,
            total_results,
            start_index,
            start,
        )
        return []

    fetch_category.last_total_results = total_results

    # --------------------------------------------------
    # 3. Extract paper information
    # --------------------------------------------------

    papers: list[dict] = []

    for entry in feed.entries:

        arxiv_url = getattr(entry, "id", "")
        paper_id = (
            arxiv_url.split("/abs/")[-1]
            if arxiv_url
            else ""
        )

        authors = [
            author.name
            for author in getattr(entry, "authors", [])
        ]

        categories = [
            tag["term"]
            for tag in getattr(entry, "tags", [])
        ]

        pdf_url = next(
            (
                link.href
                for link in getattr(entry, "links", [])
                if getattr(link, "type", "") == "application/pdf"
            ),
            arxiv_url.replace("/abs/", "/pdf/")
            if arxiv_url
            else "",
        )

        primary_category = getattr(
            getattr(entry, "arxiv_primary_category", None),
            "term",
            category,
        )

        papers.append(
            {
                "paper_id": paper_id,
                "title": clean_text(
                    getattr(entry, "title", "")
                ),
                "abstract": clean_text(
                    getattr(entry, "summary", "")
                ),
                "authors": ", ".join(authors),
                "primary_category": primary_category,
                "all_categories": ", ".join(categories),
                "published_date": getattr(
                    entry,
                    "published",
                    "",
                ),
                "updated_date": getattr(
                    entry,
                    "updated",
                    "",
                ),
                "pdf_url": pdf_url,
                "arxiv_url": arxiv_url,
            }
        )

    # --------------------------------------------------
    # 4. Mark extraction successful
    # --------------------------------------------------

    fetch_category.last_request_succeeded = True

    active_logger.info(
        "Fetched %s papers for %s "
        "(offset=%s, total_available=%s)",
        len(papers),
        category,
        start,
        total_results,
    )

    return papers

def fetch_category_backfill(
    category: str,
    date_from: str,
    date_to: str,
    logger: logging.Logger | None = None,
    session: requests.Session | None = None,
    page_size: int = 100,
    max_pages: int = 50,
) -> list[dict]:
    """Fetch all papers in a date range and verify extraction completeness."""

    if not 1 <= page_size <= 1000:
        raise ValueError("page_size must be between 1 and 1000")

    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")

    if not date_from or not date_to:
        raise ValueError("Both date_from and date_to are required")

    active_logger = logger or logging.getLogger("etl")

    papers: list[dict] = []
    start = 0
    expected_total: int | None = None

    with (
        nullcontext(session) if session is not None else requests.Session()
    ) as client:

        for page_number in range(max_pages):
            active_logger.info(
                "Backfilling %s: page=%s, offset=%s",
                category,
                page_number + 1,
                start,
            )

            page = fetch_category(
                category,
                logger=active_logger,
                session=client,
                start=start,
                max_results=page_size,
                date_from=date_from,
                date_to=date_to,
            )

            # 1. Fail immediately if the API request failed
            if not fetch_category.last_request_succeeded:
                raise RuntimeError(
                    f"Backfill failed for {category} at offset {start}"
                )

            # 2. Read the total number of matching papers
            reported_total = fetch_category.last_total_results

            if reported_total < 0:
                raise RuntimeError(
                    f"Missing pagination metadata for {category} "
                    f"at offset {start}"
                )

            if expected_total is None:
                expected_total = reported_total

                active_logger.info(
                    "arXiv reports %s matching papers for %s",
                    expected_total,
                    category,
                )

            elif reported_total != expected_total:
                raise RuntimeError(
                    f"arXiv result count changed for {category}: "
                    f"expected {expected_total}, got {reported_total}"
                )

            # 3. Collect the page
            papers.extend(page)

            # 4. Ensure we haven't retrieved too many papers
            if len(papers) > expected_total:
                raise RuntimeError(
                    f"Backfill returned too many papers for {category}: "
                    f"expected {expected_total}, got {len(papers)}"
                )

            # 5. Finish only when all expected papers are retrieved
            if len(papers) == expected_total:
                active_logger.info(
                    "Backfill complete for %s: %s/%s papers",
                    category,
                    len(papers),
                    expected_total,
                )
                return papers

            # 6. A short page before reaching the total is suspicious
            if len(page) < page_size:
                raise RuntimeError(
                    f"Incomplete backfill for {category}: "
                    f"expected {expected_total}, got {len(papers)}"
                )

            # 7. Move to the next page
            start += page_size

            # Avoid unnecessary waiting after the last permitted page
            if page_number + 1 < max_pages:
                time.sleep(REQUEST_DELAY_SECONDS)

    raise RuntimeError(
        f"Backfill for {category} reached max_pages={max_pages}. "
        f"Retrieved {len(papers)}/{expected_total} papers. "
        "Narrow the date range or increase max_pages."
    )

def extract_arxiv_data(
    logger: logging.Logger | None = None,
    categories: list[str] | None = None,
) -> dict[str, int]:
    active_logger = logger or logging.getLogger("etl")

    selected_categories = (
        ARXIV_CATEGORIES if categories is None else categories
    )

    # Rolling three-day window in UTC
    now = datetime.now(timezone.utc)

    date_from = (
        now - timedelta(days=3)
    ).strftime("%Y%m%d0000")

    date_to = now.strftime("%Y%m%d%H%M")

    active_logger.info(
        "Daily extraction window: %s to %s",
        date_from,
        date_to,
    )

    all_papers: list[dict] = []
    categories_attempted = len(selected_categories)
    categories_succeeded = 0
    categories_failed = 0

    for index, category in enumerate(selected_categories):
        if index > 0:
            time.sleep(REQUEST_DELAY_SECONDS)

        try:
            papers = fetch_category_backfill(
                category=category,
                date_from=date_from,
                date_to=date_to,
                logger=active_logger,
                page_size=ARXIV_MAX_RESULTS,
            )

            all_papers.extend(papers)
            categories_succeeded += 1

        except Exception:
            categories_failed += 1

            active_logger.exception(
                "Daily extraction failed for category %s",
                category,
            )

    # Never publish incomplete extraction results
    if categories_failed > 0:
        raise RuntimeError(
            f"Daily extraction incomplete: "
            f"{categories_failed}/{categories_attempted} categories failed"
        )

    # Deduplicate papers appearing in multiple categories
    unique_papers = {
        paper["paper_id"]: paper
        for paper in all_papers
    }

    raw_df = pd.DataFrame(
        unique_papers.values(),
        columns=RAW_COLUMNS,
    )

    raw_df.to_csv(OUTPUT_PATH, index=False)

    metrics = {
        "papers_fetched": len(raw_df),
        "categories_attempted": categories_attempted,
        "categories_succeeded": categories_succeeded,
        "categories_failed": categories_failed,
    }

    active_logger.info(
        "Saved %s unique papers to %s",
        len(raw_df),
        OUTPUT_PATH,
    )

    return metrics

def main() -> None:
    extract_arxiv_data()


if __name__ == "__main__":
    main()
