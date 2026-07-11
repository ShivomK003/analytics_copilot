from pathlib import Path
import json
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
CLEAN_PATH = ROOT_DIR / "data" / "clean" / "arxiv_papers_clean.csv"
REPORTS_DIR = ROOT_DIR / "data" / "reports"
REPORT_PATH = REPORTS_DIR / "quality_report.json"


def is_empty(value):
    return pd.isna(value) or str(value).strip() == "" or str(value).strip() == "[]"


def main():
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(CLEAN_PATH)

    published_dates = pd.to_datetime(df["published_date"], errors="coerce")

    report = {
        "papers_fetched": int(len(df)),
        "missing_paper_id": int(df["paper_id"].apply(is_empty).sum()),
        "missing_titles": int(df["title"].apply(is_empty).sum()),
        "missing_abstracts": int(df["abstract"].apply(is_empty).sum()),
        "missing_authors": int(df["authors"].apply(is_empty).sum()),
        "invalid_published_date": int(published_dates.isna().sum()),
        "duplicate_paper_id": int(df["paper_id"].duplicated().sum()),
        "papers_without_detected_topics": int(
            df["detected_topics"].apply(is_empty).sum()
        ),
    }

    critical_checks = [
        "missing_paper_id",
        "missing_titles",
        "missing_abstracts",
        "missing_authors",
        "invalid_published_date",
        "duplicate_paper_id",
    ]

    failed_checks = sum(report[key] for key in critical_checks)

    report["status"] = "PASS" if failed_checks == 0 else "WARN"

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=4)

    print("Data quality report generated:")
    print(REPORT_PATH)
    print(json.dumps(report, indent=4))

    return report


if __name__ == "__main__":
    main()
