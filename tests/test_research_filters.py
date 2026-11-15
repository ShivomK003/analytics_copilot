"""Database-independent tests of analytical date and selection conventions."""

import importlib
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


def import_without_database(name):
    """Import backend modules without triggering the production connection pool."""
    fake = ModuleType("app.db")
    fake.fetch_all = lambda *args: []
    fake.fetch_one = lambda *args: None
    fake.close_connection_pool = lambda: None
    original = sys.modules.get("app.db")
    sys.modules["app.db"] = fake
    try:
        return importlib.import_module(name)
    finally:
        if original is None:
            sys.modules.pop("app.db", None)
        else:
            sys.modules["app.db"] = original


filters = import_without_database("app.services.research_filters")


class DateFilterTests(unittest.TestCase):
    def test_valid_and_unbounded_dates(self):
        for start, end in [("2026-01-01", "2026-01-02"), (None, "2026-01-02"), ("2026-01-01", None), (None, None)]:
            with self.subTest(start=start, end=end):
                actual = filters.parse_date_range(start, end)
                self.assertEqual(actual, (date.fromisoformat(start) if start else None, date.fromisoformat(end) if end else None))

    def test_malformed_and_invalid_dates(self):
        for value in ["2026-1-01", "20260101", "2026-02-30", "2026-01-01T00:00:00Z", " 2026-01-01", "", "2026/01/01", "0000-01-01"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                filters.parse_date_range(value)

    def test_reversed_range(self):
        with self.assertRaises(ValueError):
            filters.parse_date_range("2026-01-02", "2026-01-01")

    def test_full_day_utc_boundaries(self):
        lower, upper = filters.utc_boundaries(date(2026, 12, 31), date(2026, 12, 31))
        self.assertEqual(lower, datetime(2026, 12, 31, tzinfo=timezone.utc))
        self.assertEqual(upper, datetime(2027, 1, 1, tzinfo=timezone.utc))
        self.assertLess(datetime(2026, 12, 31, 23, 59, 59, 999999, tzinfo=timezone.utc), upper)

    def test_predicates_are_parameterized(self):
        sql, params = filters.publication_date_predicate(date(2026, 1, 1), date(2026, 1, 2))
        self.assertIn("p.published_date >= %s", sql)
        self.assertIn("p.published_date < %s", sql)
        self.assertNotIn("2026", sql)
        self.assertEqual(params[1], datetime(2026, 1, 3, tzinfo=timezone.utc))
        self.assertEqual(filters.publication_date_predicate(), ("p.published_date is not null", []))

    def test_maximum_end_date_has_controlled_error(self):
        with self.assertRaises(ValueError):
            filters.utc_boundaries(None, date.max)


class TopicFilterTests(unittest.TestCase):
    def test_multiple_duplicate_and_deterministic_ids(self):
        with patch.object(filters, "fetch_all", return_value=[{"topic_id": 1}, {"topic_id": 2}]) as fetch:
            self.assertEqual(filters.validate_topic_ids([2, 1, 2]), [1, 2])
            self.assertEqual(fetch.call_args.args[1], ([1, 2],))
            self.assertIn("any(%s", fetch.call_args.args[0])

    def test_empty_selection_does_not_query(self):
        with patch.object(filters, "fetch_all") as fetch:
            self.assertEqual(filters.validate_topic_ids(), [])
            self.assertEqual(filters.validate_topic_ids([]), [])
            fetch.assert_not_called()

    def test_invalid_types_and_nonpositive_ids(self):
        for value in [-1, 0, "1", 1.5, True]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                filters.normalize_topic_ids([value])

    def test_unknown_ids(self):
        with patch.object(filters, "fetch_all", return_value=[{"topic_id": 1}]):
            with self.assertRaisesRegex(ValueError, "2, 3"):
                filters.validate_topic_ids([3, 1, 2])

    def test_database_failures_are_not_validation_errors(self):
        with patch.object(filters, "fetch_all", side_effect=RuntimeError("database unavailable")):
            with self.assertRaises(RuntimeError):
                filters.validate_topic_ids([1])
