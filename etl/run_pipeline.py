from time import perf_counter

from etl.config import ensure_directories, validate_environment
from etl.extract.ingest_arxiv import extract_arxiv_data
from etl.load.load_supabase import get_conn, load_to_supabase
from etl.monitoring.logging_config import setup_logging
from etl.monitoring.metadata import finish_etl_run, start_etl_run
from etl.transform.transform_arxiv import transform_arxiv_data
from etl.validate.validate_arxiv import validate_arxiv_data
from etl.warehouse.build_warehouse_tables import build_warehouse_tables


def run_pipeline() -> dict[str, object]:
    ensure_directories()
    validate_environment()
    logger = setup_logging()
    logger.info("ETL pipeline started")

    started_at = perf_counter()
    metadata_conn = get_conn()
    run_id = start_etl_run(metadata_conn)
    logger.info("ETL run ID: %s", run_id)

    papers_fetched = 0
    new_papers_loaded = 0
    duplicates_skipped = 0

    try:
        extract_metrics = extract_arxiv_data(logger=logger)
        papers_fetched = int(extract_metrics["papers_fetched"])
        logger.info("Papers fetched: %s", papers_fetched)

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
        metadata_conn.close()


def main() -> None:
    run_pipeline()


if __name__ == "__main__":
    main()
