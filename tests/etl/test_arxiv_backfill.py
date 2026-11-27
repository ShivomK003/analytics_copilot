import unittest
from unittest.mock import patch

from etl.extract import ingest_arxiv


class ArxivBackfillTests(unittest.TestCase):

    def test_backfill_paginates_until_short_page(self):
        offsets = []

        def fake_fetch(category, **kwargs):
            offsets.append(kwargs["start"])
            mock_fetch.last_request_succeeded = True
            mock_fetch.last_total_results = 3

            if kwargs["start"] == 0:
                return [{"paper_id": "1"}, {"paper_id": "2"}]

            return [{"paper_id": "3"}]

        with (
            patch(
                "etl.extract.ingest_arxiv.fetch_category",
                side_effect=fake_fetch,
            ) as mock_fetch,
            patch("etl.extract.ingest_arxiv.time.sleep"),
        ):
            papers = ingest_arxiv.fetch_category_backfill(
                category="cs.AI",
                date_from="202610010000",
                date_to="202610102359",
                page_size=2,
            )

        self.assertEqual(offsets, [0, 2])
        self.assertEqual(len(papers), 3)

    def test_backfill_fails_when_second_page_fails(self):

        def fake_fetch(category, **kwargs):
            if kwargs["start"] == 0:
                mock_fetch.last_request_succeeded = True
                mock_fetch.last_total_results = 3
                return [{"paper_id": "1"}, {"paper_id": "2"}]

            mock_fetch.last_request_succeeded = False
            return []

        with (
            patch(
                "etl.extract.ingest_arxiv.fetch_category",
                side_effect=fake_fetch,
            ) as mock_fetch,
            patch("etl.extract.ingest_arxiv.time.sleep"),
            self.assertRaisesRegex(
                RuntimeError,
                "Backfill failed for cs.AI at offset 2",
            ),
        ):
            ingest_arxiv.fetch_category_backfill(
                category="cs.AI",
                date_from="202610010000",
                date_to="202610102359",
                page_size=2,
            )