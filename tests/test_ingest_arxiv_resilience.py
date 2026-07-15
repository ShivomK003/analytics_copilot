import logging
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

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
        session = MagicMock()
        session.get.side_effect = [
            requests.exceptions.ReadTimeout("slow"),
            requests.exceptions.ConnectionError("offline"),
            _FakeResponse(),
        ]

        with (
            self.assertLogs("etl", level="WARNING") as captured_logs,
            patch("etl.extract.ingest_arxiv.feedparser.parse", return_value=SimpleNamespace(entries=[_build_entry()])),
            patch("etl.extract.ingest_arxiv.time.sleep") as sleep_mock,
        ):
            papers = ingest_arxiv.fetch_category("cs.AI", session=session)

        self.assertEqual(len(papers), 1)
        self.assertTrue(ingest_arxiv.fetch_category.last_request_succeeded)
        self.assertEqual(
            sleep_mock.call_args_list,
            [call(ingest_arxiv.INITIAL_RETRY_DELAY_SECONDS), call(ingest_arxiv.INITIAL_RETRY_DELAY_SECONDS * 2)],
        )
        self.assertEqual(session.get.call_count, 3)
        self.assertIn("Retry 1/3 for category cs.AI due to timeout", "\n".join(captured_logs.output))
        self.assertIn("Retry 2/3 for category cs.AI due to timeout", "\n".join(captured_logs.output))

    def test_fetch_category_skips_after_retry_exhaustion(self) -> None:
        session = MagicMock()
        session.get.side_effect = requests.exceptions.ReadTimeout("still slow")

        with (
            self.assertLogs("etl", level="WARNING") as captured_logs,
            patch("etl.extract.ingest_arxiv.time.sleep") as sleep_mock,
        ):
            papers = ingest_arxiv.fetch_category("cs.LG", session=session)

        self.assertEqual(papers, [])
        self.assertFalse(ingest_arxiv.fetch_category.last_request_succeeded)
        self.assertEqual(
            sleep_mock.call_args_list,
            [
                call(ingest_arxiv.INITIAL_RETRY_DELAY_SECONDS),
                call(ingest_arxiv.INITIAL_RETRY_DELAY_SECONDS * 2),
                call(ingest_arxiv.INITIAL_RETRY_DELAY_SECONDS * 4),
            ],
        )
        log_text = "\n".join(captured_logs.output)
        self.assertIn("Retry 1/3 for category cs.LG due to timeout", log_text)
        self.assertIn("Retry 2/3 for category cs.LG due to timeout", log_text)
        self.assertIn("Retry 3/3 for category cs.LG due to timeout", log_text)
        self.assertIn("Skipping category cs.LG after 3 failed attempts", log_text)

    def test_extract_arxiv_data_continues_when_category_fails(self) -> None:
        def fake_fetch_category(category: str, logger: logging.Logger | None = None, session=None, timeout=30):
            if category == "cs.AI":
                ingest_arxiv.fetch_category.last_request_succeeded = False
                return []

            ingest_arxiv.fetch_category.last_request_succeeded = True
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
            session = _SessionContext()
            with (
                patch("etl.extract.ingest_arxiv.OUTPUT_PATH", output_path),
                patch("etl.extract.ingest_arxiv.requests.Session", return_value=session),
                patch("etl.extract.ingest_arxiv.fetch_category", side_effect=fake_fetch_category),
                patch("etl.extract.ingest_arxiv.REQUEST_DELAY_SECONDS", 0),
            ):
                metrics = ingest_arxiv.extract_arxiv_data(categories=["cs.AI", "cs.CL"])

        self.assertEqual(
            metrics,
            {
                "papers_fetched": 1,
                "categories_attempted": 2,
                "categories_succeeded": 1,
                "categories_failed": 1,
            },
        )
        self.assertTrue(output_path.exists())
        csv_text = output_path.read_text(encoding="utf-8")
        self.assertIn("paper_id,title,abstract,authors,primary_category,all_categories", csv_text)
        self.assertIn("1234.5678,Recovered paper,Recovered abstract,Author One,cs.CL,cs.CL", csv_text)
