import unittest
from unittest.mock import MagicMock, patch

import pandas as pd

from etl.load import load_supabase


class LoadSupabaseTests(unittest.TestCase):

    def test_existing_papers_receive_missing_relationships(self):
        paper_id = "2609.00001"

        warehouse_data = {
            "fact_papers.csv": pd.DataFrame([
                {"paper_id": paper_id}
            ]),
            "dim_author.csv": pd.DataFrame([
                {"author_id": 1, "author_name": "Test Author"}
            ]),
            "dim_category.csv": pd.DataFrame([
                {"category_id": 1, "category_code": "cs.AI"}
            ]),
            "dim_topic.csv": pd.DataFrame([
                {"topic_id": 1, "topic_name": "Machine Learning"}
            ]),
            "paper_authors.csv": pd.DataFrame([
                {"paper_id": paper_id, "author_id": 1}
            ]),
            "paper_categories.csv": pd.DataFrame([
                {"paper_id": paper_id, "category_id": 1}
            ]),
            "paper_topics.csv": pd.DataFrame([
                {"paper_id": paper_id, "topic_id": 1}
            ]),
        }

        conn = MagicMock()

        with (
            patch.object(
                load_supabase,
                "_read_warehouse_csv",
                side_effect=lambda name: warehouse_data[name],
            ),
            patch.object(load_supabase, "get_conn", return_value=conn),
            patch.object(
                load_supabase,
                "get_existing_paper_ids",
                return_value={paper_id},
            ),
            patch.object(
                load_supabase,
                "_insert_fact_papers",
                return_value=0,
            ) as insert_facts,
            patch.object(
                load_supabase,
                "_upsert_dimensions_with_ids",
            ),
            patch.object(
                load_supabase,
                "_fetch_dimension_mapping",
                side_effect=[
                    {"Test Author": 10},
                    {"cs.AI": 20},
                    {"Machine Learning": 30},
                ],
            ),
            patch.object(
                load_supabase,
                "_insert_bridge_rows",
                return_value=1,
            ) as insert_bridges,
        ):
            metrics = load_supabase.load_to_supabase()

        # The existing paper must not be inserted again.
        self.assertEqual(metrics["new_papers_loaded"], 0)
        self.assertEqual(metrics["duplicates_skipped"], 1)
        insert_facts.assert_called_once()
        self.assertEqual(insert_facts.call_args.args[2], set())

        # All three relationship types must still be processed.
        self.assertEqual(insert_bridges.call_count, 3)

        expected_tables = {
            "paper_authors",
            "paper_categories",
            "paper_topics",
        }

        actual_tables = {
            call.args[2]
            for call in insert_bridges.call_args_list
        }

        self.assertEqual(actual_tables, expected_tables)

        # Each bridge receives the existing paper.
        for call in insert_bridges.call_args_list:
            bridge_df = call.args[1]
            self.assertEqual(
                bridge_df["paper_id"].tolist(),
                [paper_id],
            )

        conn.commit.assert_called_once()
        conn.rollback.assert_not_called()
        conn.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()