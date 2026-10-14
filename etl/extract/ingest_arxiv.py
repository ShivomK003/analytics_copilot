import logging
import math
import random
import time
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
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
MAX_RETRY_DELAY_SECONDS = 120
RETRY_JITTER_FRACTION = 0.25
TRANSIENT_HTTP_STATUSES = frozenset({429, 500, 502, 503, 504})
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


class _RequestPacer:
    """Enforce sequential attempt-start spacing using monotonic time, not wall time."""

    def __init__(self) -> None:
        self.last_attempt_at: float | None = None
        self.server_retry_at = 0.0
        self.cooldown_exceeded = False

    def note_server_cooldown(self, seconds: float | None) -> None:
        """Retain server cooldowns across category failures; over-budget runs send no more requests."""
        if seconds is not None:
            self.server_retry_at = max(self.server_retry_at, time.monotonic() + seconds)
            self.cooldown_exceeded |= seconds > MAX_RETRY_DELAY_SECONDS

    def wait(self, retry_delay: float = 0) -> float:
        """Wait for the larger of retry cooldown and remaining minimum spacing."""
        remaining = 0.0 if self.last_attempt_at is None else max(
            0.0, REQUEST_DELAY_SECONDS - (time.monotonic() - self.last_attempt_at)
        )
        delay = max(retry_delay, remaining, self.server_retry_at - time.monotonic())
        if delay > 0:
            time.sleep(delay)
        return delay


_REQUEST_PACER: ContextVar[_RequestPacer | None] = ContextVar("arxiv_request_pacer", default=None)


@contextmanager
def arxiv_request_run():
    """Share one pacer through nested extraction calls; reset it when the run ends.

    ContextDecorator preserves workflow signatures. Historical and daily entry
    points establish a run; standalone category/page calls also work independently.
    """
    token = None
    if _REQUEST_PACER.get() is None:
        token = _REQUEST_PACER.set(_RequestPacer())
    try:
        yield
    finally:
        if token is not None:
            _REQUEST_PACER.reset(token)


def _retry_after_seconds(value: str | None) -> float | None:
    """Parse finite nonnegative seconds or an aware HTTP date; invalid values are ignored."""
    if not value:
        return None
    try:
        seconds = float(value)
    except (ValueError, OverflowError):
        try:
            deadline = parsedate_to_datetime(value)
            if deadline.tzinfo is None:
                # Obsolete asctime HTTP dates omit GMT but still denote UTC.
                deadline = deadline.replace(tzinfo=timezone.utc)
            seconds = max(0.0, (deadline - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None
    return seconds if math.isfinite(seconds) and seconds >= 0 else None


def _retry_delay(attempt: int, status: int | None, server_delay: float | None) -> float | None:
    """Calculate capped exponential backoff with positive jitter and a server lower bound.

    None means the server requires more than the 120-second sleep budget: fail the
    page and suppress further HTTP attempts in the run, never cap Retry-After
    and then retry earlier than the requested cooldown.
    """
    if server_delay is not None and server_delay > MAX_RETRY_DELAY_SECONDS:
        return None
    base = RATE_LIMIT_RETRY_DELAY_SECONDS if status == 429 else INITIAL_RETRY_DELAY_SECONDS
    exponential = min(MAX_RETRY_DELAY_SECONDS, base * (2 ** attempt))
    jittered = min(MAX_RETRY_DELAY_SECONDS, exponential * (1 + random.uniform(0, RETRY_JITTER_FRACTION)))
    return max(jittered, server_delay or 0.0)


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


@arxiv_request_run()
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
    """Fetch one Atom page with bounded transient retries and run-wide attempt pacing."""

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
    pacer = _REQUEST_PACER.get()
    retry_delay = 0.0
    status_code = None
    failure_kind = None

    for attempt in range(MAX_RETRIES + 1):
        if pacer.cooldown_exceeded:
            active_logger.error(
                "arXiv request blocked category=%s offset=%s; run Retry-After exceeds sleep budget, no early retry",
                category, start,
            )
            return []
        actual_delay = pacer.wait(retry_delay)
        if attempt:
            active_logger.warning(
                "arXiv retry category=%s offset=%s status=%s failure=%s retry=%s/%s delay=%.3fs",
                category, start, status_code, failure_kind, attempt, MAX_RETRIES, actual_delay,
            )
        status_code = None
        retry_after = None
        try:
            pacer.last_attempt_at = time.monotonic()
            response = client.get(
                url, timeout=timeout, headers={"User-Agent": ARXIV_USER_AGENT},
            )
            response.raise_for_status()
            break
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            failure_kind = type(exc).__name__
        except requests.exceptions.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            failure_kind = "HTTPError"
            if status_code not in TRANSIENT_HTTP_STATUSES:
                active_logger.error(
                    "arXiv request failed category=%s offset=%s status=%s attempt=%s/%s; non-retryable HTTP error",
                    category, start, status_code, attempt + 1, MAX_RETRIES + 1,
                )
                return []
            retry_after = exc.response.headers.get("Retry-After")
        except requests.RequestException as exc:
            active_logger.error(
                "arXiv request failed category=%s offset=%s status=%s attempt=%s/%s failure=%s",
                category, start, status_code, attempt + 1, MAX_RETRIES + 1, type(exc).__name__,
            )
            return []
        server_delay = _retry_after_seconds(retry_after)
        pacer.note_server_cooldown(server_delay)
        if attempt == MAX_RETRIES:
            active_logger.error(
                "arXiv retries exhausted category=%s offset=%s status=%s attempts=%s failure=%s",
                category, start, status_code, MAX_RETRIES + 1, failure_kind,
            )
            return []
        retry_delay = _retry_delay(attempt, status_code, server_delay)
        if retry_delay is None:
            active_logger.error(
                "arXiv request failed category=%s offset=%s status=%s attempt=%s/%s; Retry-After exceeds %.1fs budget, no early retry",
                category, start, status_code, attempt + 1, MAX_RETRIES + 1, MAX_RETRY_DELAY_SECONDS,
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

@arxiv_request_run()
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


    raise RuntimeError(
        f"Backfill for {category} reached max_pages={max_pages}. "
        f"Retrieved {len(papers)}/{expected_total} papers. "
        "Narrow the date range or increase max_pages."
    )

@arxiv_request_run()
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

    for category in selected_categories:

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
