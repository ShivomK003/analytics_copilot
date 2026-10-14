import csv
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from test_arxiv_retries import FakeClock

import requests

from etl.extract import ingest_arxiv


def _build_entry() -> SimpleNamespace:
    return SimpleNamespace(
        id="https://arxiv.org/abs/1234.5678",
        title="Test title",
        summary="Test abstract",
        authors=[SimpleNamespace(name="Author One")],
        tags=[{"term": "cs.AI"}],
        links=[SimpleNamespace(type="application/pdf", href="https://arxiv.org/pdf/1234.5678")],
        published="2026-07-15T00:00:00Z",
        updated="2026-07-15T00:00:00Z",
    )


class _FakeResponse:
    def __init__(self, text: str = "<feed />") -> None:
        self.text = text

    def raise_for_status(self) -> None:
        return None


class _SessionContext:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class IngestArxivResilienceTests(unittest.TestCase):
    def test_fetch_category_retries_transient_failures_then_succeeds(self) -> None:
        clock = FakeClock()
        session = MagicMock()
        session.get.side_effect = [
            requests.exceptions.ReadTimeout("slow"),
            requests.exceptions.ConnectionError("offline"),
            _FakeResponse(),
        ]

        with (
            self.assertLogs("etl", level="WARNING") as captured_logs,
            patch("etl.extract.ingest_arxiv.feedparser.parse", 
                  return_value=SimpleNamespace(
                    bozo=False,
                    feed={
                        "opensearch_totalresults": "0",
                        "opensearch_startindex": "0",
                    },
                    entries=[_build_entry()],
                )
            ),
            patch("etl.extract.ingest_arxiv.time.sleep", side_effect=clock.sleep),
            patch("etl.extract.ingest_arxiv.time.monotonic", side_effect=clock.monotonic),
            patch("etl.extract.ingest_arxiv.random.uniform", return_value=0),
        ):
            papers = ingest_arxiv.fetch_category("cs.AI", session=session)

        self.assertEqual(len(papers), 1)
        self.assertTrue(ingest_arxiv.fetch_category.last_request_succeeded)
        self.assertEqual(
            clock.sleeps,
            [3, 4],
        )
        self.assertEqual(session.get.call_count, 3)
        self.assertIn("retry=1/3", "\n".join(captured_logs.output))
        self.assertIn("retry=2/3", "\n".join(captured_logs.output))

    def test_fetch_category_skips_after_retry_exhaustion(self) -> None:
        clock = FakeClock()
        session = MagicMock()
        session.get.side_effect = requests.exceptions.ReadTimeout("still slow")

        with (
            self.assertLogs("etl", level="WARNING") as captured_logs,
            patch("etl.extract.ingest_arxiv.time.sleep", side_effect=clock.sleep),
            patch("etl.extract.ingest_arxiv.time.monotonic", side_effect=clock.monotonic),
            patch("etl.extract.ingest_arxiv.random.uniform", return_value=0),
        ):
            papers = ingest_arxiv.fetch_category("cs.LG", session=session)

        self.assertEqual(papers, [])
        self.assertFalse(ingest_arxiv.fetch_category.last_request_succeeded)
        self.assertEqual(
            clock.sleeps,
            [3, 4, 8],
        )
        log_text = "\n".join(captured_logs.output)
        self.assertIn("retry=1/3", log_text)
        self.assertIn("retry=2/3", log_text)
        self.assertIn("retry=3/3", log_text)
        self.assertIn("retries exhausted category=cs.LG offset=0 status=None attempts=4", log_text)

    def test_extract_arxiv_data_aborts_when_category_fails(self) -> None:
        def fake_fetch_category_backfill(category: str, **kwargs):
            if category == "cs.AI":
                raise RuntimeError("Simulated arXiv extraction failure")

            return [
                {
                    "paper_id": "1234.5678",
                    "title": "Recovered paper",
                    "abstract": "Recovered abstract",
                    "authors": "Author One",
                    "primary_category": category,
                    "all_categories": category,
                    "published_date": "2026-07-15T00:00:00Z",
                    "updated_date": "2026-07-15T00:00:00Z",
                    "pdf_url": "https://arxiv.org/pdf/1234.5678",
                    "arxiv_url": "https://arxiv.org/abs/1234.5678",
                }
            ]

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "arxiv_papers_raw.csv"

            with (
                patch("etl.extract.ingest_arxiv.OUTPUT_PATH", output_path),
                patch(
                    "etl.extract.ingest_arxiv.fetch_category_backfill",
                    side_effect=fake_fetch_category_backfill,
                ) as fetch,
                patch("etl.extract.ingest_arxiv.REQUEST_DELAY_SECONDS", 0),
                self.assertRaisesRegex(
                    RuntimeError,
                    "Daily extraction incomplete: 1/2 categories failed",
                ),
            ):
                ingest_arxiv.extract_arxiv_data(
                    categories=["cs.AI", "cs.CL"]
                )

            # Both categories should still have been attempted
            self.assertEqual(fetch.call_count, 2)

            # Partial extraction results must never be published
            self.assertFalse(output_path.exists())

    def test_daily_extraction_deduplicates_categories(self) -> None:
        paper = {
            "paper_id": "2609.00001",
            "title": "Test Paper",
            "abstract": "Test abstract",
            "authors": "Test Author",
            "primary_category": "cs.AI",
            "all_categories": "cs.AI, cs.LG",
            "published_date": "2026-09-15T10:00:00Z",
            "updated_date": "2026-09-15T10:00:00Z",
            "pdf_url": "https://arxiv.org/pdf/2609.00001",
            "arxiv_url": "https://arxiv.org/abs/2609.00001",
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "arxiv_papers_raw.csv"

            with (
                patch("etl.extract.ingest_arxiv.OUTPUT_PATH", output_path),
                patch(
                    "etl.extract.ingest_arxiv.fetch_category_backfill",
                    return_value=[paper],
                ) as fetch,
                patch("etl.extract.ingest_arxiv.REQUEST_DELAY_SECONDS", 0),
            ):
                metrics = ingest_arxiv.extract_arxiv_data(
                    categories=["cs.AI", "cs.LG"]
                )

            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(metrics["papers_fetched"], 1)
            self.assertEqual(metrics["categories_succeeded"], 2)
            self.assertEqual(metrics["categories_failed"], 0)

            with output_path.open(encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["paper_id"], "2609.00001")