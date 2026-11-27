import csv
import logging
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from etl.validate import validate_arxiv


class _FakeMetadataConn:
    def close(self) -> None:
        return None


def _reset_etl_logger() -> None:
    logger = logging.getLogger("etl")
    for handler in list(logger.handlers):
        handler.close()
        logger.removeHandler(handler)


class ValidationFailureTests(unittest.TestCase):
    def tearDown(self) -> None:
        _reset_etl_logger()

    def test_validator_reports_fail_for_missing_paper_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            clean_csv = temp_path / "arxiv_papers_clean.csv"
            report_json = temp_path / "quality_report.json"

            with clean_csv.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
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
                        "year",
                        "month",
                        "week",
                        "detected_topics",
                    ],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "paper_id": "",
                        "title": "Test title",
                        "abstract": "Test abstract",
                        "authors": "Author One",
                        "primary_category": "cs.AI",
                        "all_categories": "cs.AI",
                        "published_date": "2026-07-11T00:00:00Z",
                        "updated_date": "2026-07-11T00:00:00Z",
                        "pdf_url": "https://example.com/paper.pdf",
                        "arxiv_url": "https://example.com/abs/1234.5678",
                        "year": 2026,
                        "month": 7,
                        "week": 28,
                        "detected_topics": "agents",
                    }
                )

            with (
                patch.object(validate_arxiv, "CLEAN_PATH", clean_csv),
                patch.object(validate_arxiv, "REPORT_PATH", report_json),
            ):
                report = validate_arxiv.validate_arxiv_data()

            self.assertEqual(report["status"], "FAIL")
            self.assertEqual(report["missing_paper_id"], 1)
            self.assertTrue(report_json.exists())

    def test_pipeline_stops_before_load_on_validation_fail(self) -> None:
        metadata_conn = _FakeMetadataConn()
        try:
            with (
                patch("etl.run_pipeline.ensure_directories"),
                patch("etl.run_pipeline.validate_environment"),
                patch("etl.run_pipeline.get_conn", return_value=metadata_conn),
                patch("etl.run_pipeline.start_etl_run", return_value="run-validation-fail"),
                patch("etl.run_pipeline.finish_etl_run") as finish_mock,
                patch(
                    "etl.run_pipeline.extract_arxiv_data",
                    return_value={"papers_fetched": 1},
                ),
                patch(
                    "etl.run_pipeline.transform_arxiv_data",
                    return_value={
                        "raw_papers": 1,
                        "clean_papers": 1,
                        "duplicates_removed": 0,
                    },
                ),
                patch(
                    "etl.run_pipeline.validate_arxiv_data",
                    return_value={
                        "papers_fetched": 1,
                        "missing_paper_id": 1,
                        "missing_titles": 0,
                        "missing_abstracts": 0,
                        "missing_authors": 0,
                        "invalid_published_date": 0,
                        "duplicate_paper_id": 0,
                        "papers_without_detected_topics": 0,
                        "status": "FAIL",
                    },
                ),
                patch("etl.run_pipeline.build_warehouse_tables") as build_mock,
                patch("etl.run_pipeline.load_to_supabase") as load_mock,
            ):
                from etl.run_pipeline import run_pipeline

                with self.assertLogs("etl", level="INFO") as captured_logs:
                    with self.assertRaisesRegex(
                        RuntimeError, "Validation failed; skipping warehouse build and database load"
                    ):
                        run_pipeline()

            build_mock.assert_not_called()
            load_mock.assert_not_called()
            finish_mock.assert_called_once()
            finish_args = finish_mock.call_args.args
            finish_kwargs = finish_mock.call_args.kwargs
            self.assertEqual(finish_args[1], "run-validation-fail")
            self.assertEqual(finish_args[5], "FAILED")
            self.assertIn("Validation failed", finish_kwargs["error_message"])

            log_text = "\n".join(captured_logs.output)
            self.assertIn("Validation status: FAIL", log_text)
            self.assertIn("ETL pipeline failed", log_text)
            self.assertIn("status FAILED", log_text)
            self.assertIn("Validation failed", log_text)
        finally:
            _reset_etl_logger()
