import logging
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from etl.monitoring import logging_config, metadata


class _FakeMetadataConn:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class _CaptureCursor:
    def __init__(self, owner) -> None:
        self.owner = owner

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params):
        self.owner.calls.append((query, params))


class _CaptureConnection:
    def __init__(self) -> None:
        self.calls = []
        self.commit_called = False

    def cursor(self):
        return _CaptureCursor(self)

    def commit(self) -> None:
        self.commit_called = True


def _reset_etl_logger() -> None:
    logger = logging.getLogger("etl")
    for handler in list(logger.handlers):
        handler.close()
        logger.removeHandler(handler)


class PipelineFailureMetadataTests(unittest.TestCase):
    def tearDown(self) -> None:
        _reset_etl_logger()

    def test_finish_metadata_records_failed_status_with_error_message(self) -> None:
        conn = _CaptureConnection()

        metadata.finish_etl_run(
            conn=conn,
            run_id="run-db-fail",
            papers_fetched=10,
            new_papers_loaded=0,
            duplicates_skipped=10,
            status="FAILED",
            duration_seconds=1.23,
            error_message="database exploded",
        )

        self.assertTrue(conn.commit_called)
        self.assertEqual(len(conn.calls), 1)
        _, params = conn.calls[0]
        self.assertIsNotNone(params[0])
        self.assertEqual(params[4], "FAILED")
        self.assertEqual(params[5], 1.23)
        self.assertEqual(params[6], "database exploded")
        self.assertEqual(params[7], "run-db-fail")

    def test_pipeline_records_failed_metadata_and_logs_traceback_on_database_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_file = Path(temp_dir) / "etl.log"
            metadata_conn = _FakeMetadataConn()
            try:
                with (
                    patch.object(logging_config, "LOG_FILE", log_file),
                    patch("etl.run_pipeline.ensure_directories"),
                    patch("etl.run_pipeline.validate_environment"),
                    patch("etl.run_pipeline.get_conn", return_value=metadata_conn),
                    patch("etl.run_pipeline.start_etl_run", return_value="run-db-fail"),
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
                            "missing_paper_id": 0,
                            "missing_titles": 0,
                            "missing_abstracts": 0,
                            "missing_authors": 0,
                            "invalid_published_date": 0,
                            "duplicate_paper_id": 0,
                            "papers_without_detected_topics": 0,
                            "status": "PASS",
                        },
                    ),
                    patch(
                        "etl.run_pipeline.build_warehouse_tables",
                        return_value={"fact_papers": 1},
                    ),
                    patch(
                        "etl.run_pipeline.load_to_supabase",
                        side_effect=RuntimeError("database exploded"),
                    ),
                ):
                    from etl.run_pipeline import run_pipeline

                    with self.assertRaisesRegex(RuntimeError, "database exploded"):
                        run_pipeline()

                finish_mock.assert_called_once()
                finish_args = finish_mock.call_args.args
                finish_kwargs = finish_mock.call_args.kwargs
                self.assertEqual(finish_args[1], "run-db-fail")
                self.assertEqual(finish_args[5], "FAILED")
                self.assertIn("database exploded", finish_kwargs["error_message"])
                self.assertTrue(metadata_conn.closed)

                _reset_etl_logger()
                log_contents = log_file.read_text(encoding="utf-8")
                self.assertIn("ETL run ID: run-db-fail", log_contents)
                self.assertIn("status FAILED", log_contents)
                self.assertIn("database exploded", log_contents)
                self.assertIn("Traceback", log_contents)
                self.assertIn("seconds", log_contents)
            finally:
                _reset_etl_logger()
