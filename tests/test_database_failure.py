import unittest
from unittest.mock import patch

import pandas as pd

from etl.load.load_supabase import load_to_supabase


class _FakeCursor:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeConnection:
    def __init__(self) -> None:
        self.rollback_called = False
        self.commit_called = False
        self.close_called = False

    def cursor(self):
        return _FakeCursor()

    def rollback(self) -> None:
        self.rollback_called = True

    def commit(self) -> None:
        self.commit_called = True

    def close(self) -> None:
        self.close_called = True


class DatabaseFailureTests(unittest.TestCase):
    def test_loader_rolls_back_when_dimension_insert_fails(self) -> None:
        fact_df = pd.DataFrame(
            [
                {
                    "paper_id": "1234.5678",
                    "title": "Paper",
                    "abstract": "Abstract",
                    "primary_category": "cs.AI",
                    "published_date": "2026-07-11T00:00:00Z",
                    "updated_date": "2026-07-11T00:00:00Z",
                    "pdf_url": "https://example.com/paper.pdf",
                    "arxiv_url": "https://example.com/abs/1234.5678",
                    "year": 2026,
                    "month": 7,
                    "week": 28,
                }
            ]
        )
        dim_author_df = pd.DataFrame([{"author_id": 1, "author_name": "Author One"}])
        dim_category_df = pd.DataFrame([{"category_id": 1, "category_code": "cs.AI"}])
        dim_topic_df = pd.DataFrame([{"topic_id": 1, "topic_name": "agents"}])
        paper_authors_df = pd.DataFrame([{"paper_id": "1234.5678", "author_id": 1}])
        paper_categories_df = pd.DataFrame([{"paper_id": "1234.5678", "category_id": 1}])
        paper_topics_df = pd.DataFrame([{"paper_id": "1234.5678", "topic_id": 1}])
        fake_conn = _FakeConnection()

        call_counter = {"count": 0}

        def fake_execute_values_if_rows(conn, query, rows, page_size=500):
            call_counter["count"] += 1
            if call_counter["count"] == 2:
                raise RuntimeError("dimension insert failed")
            return len(list(rows))

        def fake_read_csv(name: str) -> pd.DataFrame:
            mapping = {
                "fact_papers.csv": fact_df,
                "dim_author.csv": dim_author_df,
                "dim_category.csv": dim_category_df,
                "dim_topic.csv": dim_topic_df,
                "paper_authors.csv": paper_authors_df,
                "paper_categories.csv": paper_categories_df,
                "paper_topics.csv": paper_topics_df,
            }
            return mapping[name].copy()

        with (
            patch("etl.load.load_supabase.get_conn", return_value=fake_conn),
            patch("etl.load.load_supabase._read_warehouse_csv", side_effect=fake_read_csv),
            patch("etl.load.load_supabase.get_existing_paper_ids", return_value=set()),
            patch(
                "etl.load.load_supabase._execute_values_if_rows",
                side_effect=fake_execute_values_if_rows,
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "dimension insert failed"):
                load_to_supabase()

        self.assertTrue(fake_conn.rollback_called)
        self.assertFalse(fake_conn.commit_called)
        self.assertTrue(fake_conn.close_called)

