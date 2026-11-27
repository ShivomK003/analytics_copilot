from unittest.mock import patch

import pytest

from etl import run_backfill


def test_backfill_runs_all_stages_without_database(tmp_path):
    papers = [
        {
            "paper_id": "2609.00001",
            "title": "Test Paper",
            "abstract": "Test abstract",
            "authors": "Test Author",
            "primary_category": "cs.AI",
            "all_categories": "cs.AI",
            "published_date": "2026-09-01",
            "updated_date": "2026-09-01",
            "pdf_url": "https://arxiv.org/pdf/2609.00001",
            "arxiv_url": "https://arxiv.org/abs/2609.00001",
        }
    ]

    with (
        patch.object(run_backfill, "ARXIV_CATEGORIES", ["cs.AI", "cs.LG"]),
        patch.object(run_backfill, "BACKFILL_DIR", tmp_path),
        patch.object(
            run_backfill,
            "fetch_category_backfill",
            return_value=papers,
        ) as fetch,
        patch.object(run_backfill, "fetch_category_backfill", return_value=papers) as fetch,
        patch.object(
            run_backfill,
            "transform_arxiv_data",
            return_value={"clean_papers": 1},
        ) as transform,
        patch.object(
            run_backfill,
            "validate_arxiv_data",
            return_value={"status": "PASS"},
        ) as validate,
        patch.object(
            run_backfill,
            "build_warehouse_tables",
            return_value={"fact_papers": 1},
        ) as warehouse,
    ):
        result = run_backfill.run_backfill(
            date_from="202610010000",
            date_to="202610102359",
        )

    assert fetch.call_count == 2
    assert result["records_fetched"] == 2
    assert result["unique_papers"] == 1

    transform.assert_called_once()
    validate.assert_called_once()
    warehouse.assert_called_once()

    raw_path = (
        tmp_path
        / "20261001_0000_20261010_2359"
        / "raw"
        / "arxiv_papers_raw.csv"
    )
    assert raw_path.exists()

def test_backfill_aborts_on_extraction_failure(tmp_path):
    def fake_fetch(category, **kwargs):
        if category == "cs.LG":
            raise RuntimeError("Simulated arXiv failure")

        return [{"paper_id": "2609.00001"}]

    with (
        patch.object(run_backfill, "ARXIV_CATEGORIES", ["cs.AI", "cs.LG"]),
        patch.object(run_backfill, "BACKFILL_DIR", tmp_path),
        patch.object(
            run_backfill,
            "fetch_category_backfill",
            side_effect=fake_fetch,
        ),
        patch.object(run_backfill, "transform_arxiv_data") as transform,
        patch.object(run_backfill, "validate_arxiv_data") as validate,
        patch.object(run_backfill, "build_warehouse_tables") as warehouse,
        pytest.raises(RuntimeError, match="Simulated arXiv failure"),
    ):
        run_backfill.run_backfill(
            date_from="202610010000",
            date_to="202610102359",
        )

    transform.assert_not_called()
    validate.assert_not_called()
    warehouse.assert_not_called()

    run_dir = tmp_path / "20261001_0000_20261010_2359"
    assert not run_dir.exists()

def test_backfill_aborts_on_validation_failure(tmp_path):
    papers = [{"paper_id": "2609.00001"}]

    with (
        patch.object(run_backfill, "ARXIV_CATEGORIES", ["cs.AI"]),
        patch.object(run_backfill, "BACKFILL_DIR", tmp_path),
        patch.object(
            run_backfill,
            "fetch_category_backfill",
            return_value=papers,
        ),
        patch.object(
            run_backfill,
            "transform_arxiv_data",
            return_value={"clean_papers": 1},
        ) as transform,
        patch.object(
            run_backfill,
            "validate_arxiv_data",
            return_value={"status": "FAIL"},
        ) as validate,
        patch.object(
            run_backfill,
            "build_warehouse_tables",
        ) as warehouse,
        pytest.raises(RuntimeError, match="Backfill validation failed"),
    ):
        run_backfill.run_backfill(
            date_from="202610010000",
            date_to="202610102359",
        )

    transform.assert_called_once()
    validate.assert_called_once()
    warehouse.assert_not_called()

    # No completed backfill should be published
    run_dir = tmp_path / "20261001_0000_20261010_2359"
    assert not run_dir.exists()

    # No temporary directories should remain
    assert list(tmp_path.glob(".backfill_tmp_*")) == []


