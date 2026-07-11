import json
import logging

import pandas as pd

from etl.config import CLEAN_DIR, REPORTS_DIR

CLEAN_PATH = CLEAN_DIR / "arxiv_papers_clean.csv"
REPORT_PATH = REPORTS_DIR / "quality_report.json"
CRITICAL_KEYS = [
    "missing_paper_id",
    "missing_titles",
    "missing_abstracts",
    "missing_authors",
    "invalid_published_date",
    "duplicate_paper_id",
]


def is_empty(value: object) -> bool:
    return pd.isna(value) or str(value).strip() in {"", "[]"}


def validate_arxiv_data(logger: logging.Logger | None = None) -> dict[str, int | str]:
    active_logger = logger or logging.getLogger("etl")
    df = pd.read_csv(CLEAN_PATH)
    published_dates = pd.to_datetime(df["published_date"], errors="coerce", utc=True)

    report: dict[str, int | str] = {
        "papers_fetched": int(len(df)),
        "missing_paper_id": int(df["paper_id"].apply(is_empty).sum()),
        "missing_titles": int(df["title"].apply(is_empty).sum()),
        "missing_abstracts": int(df["abstract"].apply(is_empty).sum()),
        "missing_authors": int(df["authors"].apply(is_empty).sum()),
        "invalid_published_date": int(published_dates.isna().sum()),
        "duplicate_paper_id": int(df["paper_id"].duplicated().sum()),
        "papers_without_detected_topics": int(df["detected_topics"].apply(is_empty).sum()),
    }

    has_failure = any(int(report[key]) > 0 for key in CRITICAL_KEYS)
    report["status"] = "FAIL" if has_failure else "PASS"

    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    active_logger.info("Saved quality report to %s", REPORT_PATH)
    return report


def main() -> None:
    validate_arxiv_data()


if __name__ == "__main__":
    main()
