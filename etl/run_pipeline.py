import argparse
from time import perf_counter

from etl.config import ensure_directories, validate_environment
from etl.extract.ingest_arxiv import extract_arxiv_data
from etl.load.load_supabase import get_conn, load_to_supabase
from etl.monitoring.logging_config import setup_logging
from etl.monitoring.metadata import finish_etl_run, start_etl_run
from etl.transform.transform_arxiv import transform_arxiv_data
from etl.validate.validate_arxiv import validate_arxiv_data
from etl.warehouse.build_warehouse_tables import build_warehouse_tables


def run_pipeline(dry_run: bool = False) -> dict[str, object]:
    ensure_directories()

    if not dry_run:
        validate_environment()

    logger = setup_logging()
    logger.info("ETL pipeline started (dry_run=%s)", dry_run)

    started_at = perf_counter()

    metadata_conn = None
    run_id = None

    if not dry_run:
        metadata_conn = get_conn()
        run_id = start_etl_run(metadata_conn)
        logger.info("ETL run ID: %s", run_id)

    papers_fetched = 0
    new_papers_loaded = 0
    duplicates_skipped = 0
    categories_attempted = 0
    categories_succeeded = 0
    categories_failed = 0

    try:
        extract_metrics = extract_arxiv_data(logger=logger)
        papers_fetched = int(extract_metrics["papers_fetched"])
        categories_attempted = int(extract_metrics.get("categories_attempted", 0))
        categories_succeeded = int(extract_metrics.get("categories_succeeded", 0))
        categories_failed = int(extract_metrics.get("categories_failed", 0))
        logger.info(
            "Papers fetched: %s (categories attempted: %s, succeeded: %s, failed: %s)",
            papers_fetched,
            categories_attempted,
            categories_succeeded,
            categories_failed,
        )

        if categories_failed > 0:
            raise RuntimeError(
                f"arXiv extraction incomplete: "
                f"{categories_failed}/{categories_attempted} categories failed. "
                f"Aborting ETL pipeline."
            )

        transform_metrics = transform_arxiv_data(logger=logger)
        logger.info(
            "Papers after transformation: %s, duplicates removed: %s",
            transform_metrics["clean_papers"],
            transform_metrics["duplicates_removed"],
        )

        validation_report = validate_arxiv_data(logger=logger)
        logger.info(
            "Validation status: %s, papers without detected topics: %s",
            validation_report["status"],
            validation_report["papers_without_detected_topics"],
        )
        if validation_report["status"] != "PASS":
            raise RuntimeError("Validation failed; skipping warehouse build and database load")

        warehouse_metrics = build_warehouse_tables(logger=logger)
        logger.info("Warehouse row counts: %s", warehouse_metrics)

        if dry_run:
            duration_seconds = round(perf_counter() - started_at, 2)
            logger.info(
                "Dry run completed successfully in %s seconds. "
                "No Supabase data was modified.",
                duration_seconds,
            )

            return {
                "run_id": None,
                "dry_run": True,
                "papers_fetched": papers_fetched,
                "categories_attempted": categories_attempted,
                "categories_succeeded": categories_succeeded,
                "categories_failed": categories_failed,
                "new_papers_loaded": 0,
                "duplicates_skipped": 0,
                "duration_seconds": duration_seconds,
            }

        load_metrics = load_to_supabase(logger=logger)
        new_papers_loaded = int(load_metrics["new_papers_loaded"])
        duplicates_skipped = int(load_metrics["duplicates_skipped"])
        logger.info(
            "Existing papers: %s, new papers loaded: %s, duplicates skipped: %s",
            load_metrics["existing_papers"],
            new_papers_loaded,
            duplicates_skipped,
        )

        duration_seconds = round(perf_counter() - started_at, 2)
        finish_etl_run(
            metadata_conn,
            run_id,
            papers_fetched,
            new_papers_loaded,
            duplicates_skipped,
            "SUCCESS",
            duration_seconds,
        )
        logger.info("ETL pipeline completed successfully in %s seconds", duration_seconds)

        return {
            "run_id": run_id,
            "papers_fetched": papers_fetched,
            "categories_attempted": categories_attempted,
            "categories_succeeded": categories_succeeded,
            "categories_failed": categories_failed,
            "new_papers_loaded": new_papers_loaded,
            "duplicates_skipped": duplicates_skipped,
            "duration_seconds": duration_seconds,
        }
    except Exception as exc:
        duration_seconds = round(perf_counter() - started_at, 2)
        logger.exception("ETL pipeline failed")
        logger.error(
            "ETL run ID %s finished with status FAILED in %s seconds: %s",
            run_id,
            duration_seconds,
            exc,
        )
        if metadata_conn is not None and run_id is not None:
            finish_etl_run(
                metadata_conn,
                run_id,
                papers_fetched,
                new_papers_loaded,
                duplicates_skipped,
                "FAILED",
                duration_seconds,
                error_message=str(exc),
            )
        raise
    finally:
        if metadata_conn is not None:
            metadata_conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the arXiv ETL pipeline")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run extraction, transformation, validation, and warehouse generation without Supabase writes",
    )
    args = parser.parse_args()

    run_pipeline(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
