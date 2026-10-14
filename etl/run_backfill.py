import argparse
import csv
import logging
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from etl.config import ARXIV_CATEGORIES, DATA_DIR
from etl.extract.ingest_arxiv import (
    arxiv_request_run,
    fetch_category_backfill,
)
from etl.transform.transform_arxiv import transform_arxiv_data
from etl.validate.validate_arxiv import validate_arxiv_data
from etl.warehouse.build_warehouse_tables import build_warehouse_tables

BACKFILL_DIR = DATA_DIR / "backfill"

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


@arxiv_request_run()
def run_backfill(
    date_from: str,
    date_to: str,
    page_size: int = 100,
    max_pages: int = 50,
) -> dict:
    """Build validated historical artifacts with shared HTTP pacing; never load Supabase."""
    date_format = "%Y%m%d%H%M"

    start_date = datetime.strptime(date_from, date_format)
    end_date = datetime.strptime(date_to, date_format)

    if start_date > end_date:
        raise ValueError("date_from must be earlier than date_to")

    run_dir = BACKFILL_DIR / (
        f"{start_date:%Y%m%d_%H%M}_{end_date:%Y%m%d_%H%M}"
    )

    if run_dir.exists():
        raise FileExistsError(
            f"Backfill directory already exists: {run_dir}. "
            "Move or remove it before rerunning this date range."
        )

    BACKFILL_DIR.mkdir(parents=True, exist_ok=True)

    temp_dir = Path(
        tempfile.mkdtemp(
            prefix=".backfill_tmp_",
            dir=BACKFILL_DIR,
        )
    )

    raw_path = temp_dir / "raw" / "arxiv_papers_raw.csv"
    clean_path = temp_dir / "clean" / "arxiv_papers_clean.csv"
    report_path = temp_dir / "reports" / "quality_report.json"
    warehouse_path = temp_dir / "warehouse"

    logger = logging.getLogger("etl")
    logging.basicConfig(level=logging.INFO)

    logger.info(
        "Starting arXiv backfill: %s to %s",
        date_from,
        date_to,
    )

    try:
        all_papers: list[dict] = []

        # 1. Extract all categories before writing files
        for category in ARXIV_CATEGORIES:

            papers = fetch_category_backfill(
                category=category,
                date_from=date_from,
                date_to=date_to,
                logger=logger,
                page_size=page_size,
                max_pages=max_pages,
            )

            logger.info(
                "Completed category %s: %s papers",
                category,
                len(papers),
            )

            all_papers.extend(papers)

        if not all_papers:
            raise RuntimeError(
                "Backfill returned zero papers across all categories."
            )

        # 2. Deduplicate papers appearing in multiple categories
        unique_papers = {
            paper["paper_id"]: paper
            for paper in all_papers
        }

        logger.info(
            "Fetched %s records; %s unique papers",
            len(all_papers),
            len(unique_papers),
        )

        # 3. Save raw data
        raw_path.parent.mkdir(parents=True, exist_ok=True)

        with raw_path.open(
            "w",
            newline="",
            encoding="utf-8",
        ) as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=RAW_COLUMNS,
            )
            writer.writeheader()
            writer.writerows(unique_papers.values())

        logger.info("Saved raw backfill to %s", raw_path)

        # 4. Transform
        transform_metrics = transform_arxiv_data(
            logger=logger,
            input_path=raw_path,
            output_path=clean_path,
        )

        # 5. Validate
        validation_report = validate_arxiv_data(
            logger=logger,
            input_path=clean_path,
            report_path=report_path,
        )

        if validation_report["status"] != "PASS":
            raise RuntimeError(
                "Backfill validation failed. "
                "No warehouse files generated."
            )

        # 6. Build warehouse tables
        warehouse_metrics = build_warehouse_tables(
            logger=logger,
            input_path=clean_path,
            output_dir=warehouse_path,
        )

        # 7. Publish completed backfill
        # Never overwrite an existing completed run
        if run_dir.exists():
            raise FileExistsError(
                f"Backfill directory already exists: {run_dir}"
            )

        temp_dir.rename(run_dir)

        logger.info(
            "Backfill completed successfully: %s",
            run_dir,
        )
        logger.info("No Supabase data was modified.")

        return {
            "date_from": date_from,
            "date_to": date_to,
            "records_fetched": len(all_papers),
            "unique_papers": len(unique_papers),
            "transform": transform_metrics,
            "validation": validation_report,
            "warehouse": warehouse_metrics,
        }

    finally:
        # Delete temporary files if extraction or processing failed
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill historical arXiv papers."
    )

    parser.add_argument("--from-date", required=True)
    parser.add_argument("--to-date", required=True)
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--max-pages", type=int, default=50)

    args = parser.parse_args()

    run_backfill(
        date_from=args.from_date,
        date_to=args.to_date,
        page_size=args.page_size,
        max_pages=args.max_pages,
    )


if __name__ == "__main__":
    main()