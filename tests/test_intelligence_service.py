"""Service failure tests and opt-in PostgreSQL SQL tests using read-only CTE fixtures."""

import os
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

from pydantic import ValidationError

from test_research_filters import import_without_database

service = import_without_database("app.services.intelligence_service")
from app.schemas.intelligence import CoverageData


class IntelligenceServiceTests(unittest.TestCase):
    def test_missing_or_incompatible_metadata(self):
        for columns in [[], [{"column_name": "status", "data_type": "text"}], [{"column_name": "status", "data_type": "text"}, {"column_name": "end_time", "data_type": "timestamp without time zone"}]]:
            with self.subTest(columns=columns), patch.object(service, "fetch_all", return_value=columns), patch.object(service, "fetch_one") as fetch:
                timestamp, warnings = service._latest_successful_etl()
                self.assertIsNone(timestamp)
                self.assertTrue(warnings)
                fetch.assert_not_called()

    def test_success_metadata_and_no_completed_runs(self):
        columns = [{"column_name": "status", "data_type": "text"}, {"column_name": "end_time", "data_type": "timestamp with time zone"}]
        timestamp = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for value in [timestamp, None]:
            with self.subTest(value=value), patch.object(service, "fetch_all", return_value=columns), patch.object(service, "fetch_one", return_value={"latest_successful_etl_at": value}) as fetch:
                actual, warnings = service._latest_successful_etl()
                self.assertEqual(actual, value)
                self.assertEqual(bool(warnings), value is None)
                self.assertEqual(fetch.call_args.args[1], ("SUCCESS",))

    def test_unrelated_metadata_failure_propagates(self):
        with patch.object(service, "fetch_all", side_effect=RuntimeError("permission denied")):
            with self.assertRaises(RuntimeError):
                service._latest_successful_etl()

    def test_freshness_query_failure_propagates(self):
        """A failure after schema resolution must not become missing freshness."""
        columns = [
            {"column_name": "status", "data_type": "text"},
            {"column_name": "end_time", "data_type": "timestamp with time zone"},
        ]
        with (
            patch.object(service, "fetch_all", return_value=columns),
            patch.object(service, "fetch_one", side_effect=RuntimeError("connection lost")),
        ):
            with self.assertRaises(RuntimeError):
                service._latest_successful_etl()

    def test_missing_aggregation_rows_are_errors(self):
        """An absent aggregate result is a service failure, not an empty corpus."""
        with patch.object(service, "fetch_one", return_value=None):
            for entry_point in (service.get_coverage, service.get_topic_options):
                with self.subTest(service=entry_point.__name__):
                    with self.assertRaises(RuntimeError):
                        entry_point()

    def test_coverage_empty_and_missing_metadata(self):
        row = dict(total_indexed_papers=0, dated_papers=0, undated_papers=0, tagged_papers=0, total_topics=2, observed_date_from=None, observed_date_to=None)
        with patch.object(service, "fetch_one", return_value=row), patch.object(service, "fetch_all", return_value=[]):
            result = service.get_coverage()
        self.assertEqual(result.data.untagged_papers, 0)
        self.assertIsNone(result.data.observed_date_from)
        self.assertIsNone(result.data.latest_successful_etl_at)
        self.assertEqual(result.meta.coverage_status, "unknown")
        self.assertTrue(any("ETL" in warning for warning in result.meta.warnings))

    def test_missing_dates_warning(self):
        meta = service._metadata(dict(undated_papers=1, observed_date_from=None, observed_date_to=None))
        self.assertTrue(any("missing publication dates" in warning for warning in meta.warnings))

    def test_inconsistent_counts_rejected(self):
        with self.assertRaises(ValidationError):
            CoverageData(total_indexed_papers=2, dated_papers=1, undated_papers=0, tagged_papers=1, untagged_papers=1, total_topics=1, observed_date_from=None, observed_date_to=None, latest_successful_etl_at=None)


# These fixtures shadow table names within SELECT statements only. No temporary
# tables, DDL or data mutations are used, and the transaction is explicitly read-only.
# The duplicate ('a', 1) intentionally stress-tests DISTINCT/EXISTS. The deployed
# paper_topics primary key (paper_id, topic_id) normally prevents duplicate pairs.
FIXTURES = """
fact_papers(paper_id, published_date) as (values
    ('a', '2026-01-01 00:00:00+00'::timestamptz),
    ('b', '2026-01-01 23:59:59.999999+00'::timestamptz),
    ('c', '2026-01-02 00:00:00+00'::timestamptz),
    ('d', null::timestamptz),
    ('e', '2025-12-31 23:59:59+00'::timestamptz)
),
dim_topic(topic_id, topic_name) as (values (1, 'vision'), (2, 'agents'), (3, 'zero')),
paper_topics(paper_id, topic_id) as (values ('a',1),('a',2),('b',1),('c',2),('d',1),('a',1))
"""


@unittest.skipUnless(os.getenv("INTELLIGENCE_SQL_TESTS") == "1", "Opt-in PostgreSQL connection; unit tests need no live database")
class IntelligenceSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Open an explicitly read-only connection from existing configuration."""
        import psycopg2
        from dotenv import dotenv_values
        from psycopg2.extras import RealDictCursor
        v = dotenv_values("backend/.env")
        cls.conn = psycopg2.connect(host=v.get("SUPABASE_HOST"), port=v.get("SUPABASE_PORT"), dbname=v.get("SUPABASE_DB"), user=v.get("SUPABASE_USER"), password=v.get("SUPABASE_PASSWORD"), sslmode=v.get("SUPABASE_SSLMODE", "require"), connect_timeout=10, cursor_factory=RealDictCursor)
        cls.conn.set_session(readonly=True)

    @classmethod
    def tearDownClass(cls):
        """Roll back the read transaction and release the connection."""
        cls.conn.rollback()
        cls.conn.close()

    def run_query(self, query, params=None, empty=False):
        """Execute the production aggregation against synthetic CTE data."""
        fixtures = FIXTURES
        if empty:
            fixtures = fixtures.replace("fact_papers(paper_id, published_date) as (values", "fixture_papers(paper_id, published_date) as (values")
            fixtures += ", fact_papers as (select * from fixture_papers where false)"
        if "with indexed_papers" in query:
            query = query.replace("with indexed_papers", f"with {fixtures}, indexed_papers", 1)
        else:
            query = f"with {fixtures} {query}"
        with self.conn.cursor() as cursor:
            cursor.execute(query, params)
            return dict(cursor.fetchone())

    def coverage(self, empty=False):
        """Run the coverage service against fixture facts without querying ETL state."""
        with patch.object(service, "fetch_one", side_effect=lambda q, p=None: self.run_query(q, p, empty)), patch.object(service, "_latest_successful_etl", return_value=(None, [])):
            return service.get_coverage()

    def topics(self, start=None, end=None, empty=False):
        """Run the topic service's production SQL with fixture facts and UTC bounds."""
        with patch.object(service, "fetch_one", side_effect=lambda q, p=None: self.run_query(q, p, empty)):
            return service.get_topic_options(start, end)

    def test_coverage_overlapping_and_duplicate_topic_rows(self):
        result = self.coverage()
        data = result.data
        self.assertEqual((data.total_indexed_papers, data.dated_papers, data.undated_papers), (5, 4, 1))
        self.assertEqual((data.tagged_papers, data.untagged_papers, data.total_topics), (4, 1, 3))
        self.assertEqual(data.observed_date_from, date(2025, 12, 31))
        self.assertEqual(data.observed_date_to, date(2026, 1, 2))
        self.assertEqual(result.meta.coverage_status, "unknown")

    def test_empty_corpus_preserves_configured_topics(self):
        coverage = self.coverage(empty=True)
        self.assertEqual(coverage.data.total_indexed_papers, 0)
        self.assertIsNone(coverage.data.observed_date_from)
        topics = self.topics(empty=True)
        self.assertEqual([t.topic_name for t in topics.data], ["agents", "vision", "zero"])
        self.assertTrue(all(t.period_paper_count == t.total_indexed_paper_count == 0 for t in topics.data))

    def test_period_counts_lifetime_distinct_and_zero_topics(self):
        result = self.topics(date(2026, 1, 1), date(2026, 1, 1))
        self.assertEqual([(t.topic_name, t.period_paper_count, t.total_indexed_paper_count) for t in result.data], [("agents", 1, 2), ("vision", 2, 3), ("zero", 0, 0)])
        self.assertEqual(result.meta.observed_date_from, date(2025, 12, 31))

    def test_unbounded_sides_and_undated_exclusion(self):
        for start, end, expected in [(None, None, [2, 2, 0]), (date(2026, 1, 2), None, [1, 0, 0]), (None, date(2026, 1, 1), [1, 2, 0])]:
            with self.subTest(start=start, end=end):
                self.assertEqual([t.period_paper_count for t in self.topics(start, end).data], expected)

    def test_selected_interval_with_no_publications(self):
        result = self.topics(date(2027, 1, 1), date(2027, 1, 2))
        self.assertTrue(all(t.period_paper_count == 0 for t in result.data))
        self.assertEqual([t.total_indexed_paper_count for t in result.data], [2, 3, 0])

    def test_queries_are_independent_of_session_timezone(self):
        with self.conn.cursor() as cursor:
            cursor.execute("select set_config('TimeZone', 'Pacific/Honolulu', true)")
        try:
            result = self.topics(date(2026, 1, 1), date(2026, 1, 1))
            self.assertEqual([t.period_paper_count for t in result.data], [1, 2, 0])
            self.assertEqual(result.meta.observed_date_to, date(2026, 1, 2))
        finally:
            with self.conn.cursor() as cursor:
                cursor.execute("select set_config('TimeZone', 'UTC', true)")
