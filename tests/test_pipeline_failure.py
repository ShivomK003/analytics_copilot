from unittest.mock import MagicMock, patch

import pytest

from etl.run_pipeline import run_pipeline


def test_pipeline_fails_when_extraction_incomplete():
    """Pipeline must fail if any arXiv category fails."""

    extraction_metrics = {
        "papers_fetched": 500,
        "categories_attempted": 6,
        "categories_succeeded": 5,
        "categories_failed": 1,
    }

    with (
        patch("etl.run_pipeline.ensure_directories"),
        patch("etl.run_pipeline.validate_environment"),
        patch("etl.run_pipeline.setup_logging") as mock_logging,
        patch("etl.run_pipeline.get_conn") as mock_get_conn,
        patch("etl.run_pipeline.start_etl_run") as mock_start,
        patch("etl.run_pipeline.finish_etl_run") as mock_finish,
        patch("etl.run_pipeline.extract_arxiv_data") as mock_extract,
        patch("etl.run_pipeline.transform_arxiv_data") as mock_transform,
        patch("etl.run_pipeline.load_to_supabase") as mock_load,
    ):
        mock_logging.return_value = MagicMock()
        mock_get_conn.return_value = MagicMock()
        mock_start.return_value = "test-run-123"
        mock_extract.return_value = extraction_metrics

        with pytest.raises(RuntimeError, match="arXiv extraction incomplete"):
            run_pipeline()

        # Verify that the run was recorded as FAILED
        assert mock_finish.call_count == 1

        args = mock_finish.call_args.args

        assert args[1] == "test-run-123"
        assert args[5] == "FAILED"

        # Verify downstream processing never started
        mock_transform.assert_not_called()
        mock_load.assert_not_called()

        # Verify database connection was closed
        mock_get_conn.return_value.close.assert_called_once()