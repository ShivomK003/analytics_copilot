"""Deterministic capacity, cleanup and HTTP tests without database connections."""

import asyncio
import importlib.util
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import MagicMock, patch

from test_intelligence_api import main, request, routes
from test_research_filters import filters
from app.errors import DatabasePoolTimeout


def isolated_database_module():
    """Load the real database helpers with mocked startup and no network access."""
    spec = importlib.util.spec_from_file_location(
        "app._database_pool_tests",
        Path(__file__).resolve().parents[1] / "backend/app/db.py",
    )
    module = importlib.util.module_from_spec(spec)
    environment = {name: "test" for name in (
        "SUPABASE_HOST", "SUPABASE_PORT", "SUPABASE_DB",
        "SUPABASE_USER", "SUPABASE_PASSWORD",
    )}
    with patch.dict("os.environ", environment), patch("dotenv.load_dotenv"), patch(
        "psycopg2.pool.ThreadedConnectionPool"
    ):
        spec.loader.exec_module(module)
    return module


class ControlledPool:
    """Track checkouts and reject over-capacity calls just like psycopg2."""

    def __init__(self, capacity):
        self.capacity = capacity
        self.lock = threading.Lock()
        self.active = set()
        self.maximum = 0
        self.acquisitions = 0
        self.at_capacity = threading.Event()
        self.returned = []

    def getconn(self):
        """Create a controlled connection while checking capacity."""
        with self.lock:
            if len(self.active) >= self.capacity:
                raise AssertionError("Unbounded checkout reached the pool")
            conn = MagicMock()
            self.active.add(conn)
            self.acquisitions += 1
            self.maximum = max(self.maximum, len(self.active))
            if len(self.active) == self.capacity:
                self.at_capacity.set()
            return conn

    def putconn(self, conn, close=False):
        """Return exactly one checked-out connection."""
        with self.lock:
            self.active.remove(conn)
            self.returned.append((conn, close))


class ObservedSemaphore:
    """Signal when all workers attempt acquisition; use real bounded waiting."""

    def __init__(self, capacity, attempts):
        self.slots = threading.BoundedSemaphore(capacity)
        self.expected = attempts
        self.count = 0
        self.lock = threading.Lock()
        self.all_attempting = threading.Event()

    def acquire(self, timeout):
        """Observe an attempt before waiting on the actual semaphore."""
        with self.lock:
            self.count += 1
            if self.count == self.expected:
                self.all_attempting.set()
        return self.slots.acquire(timeout=timeout)

    def release(self):
        """Return a capacity permit."""
        self.slots.release()


class DatabasePoolTests(unittest.TestCase):
    def setUp(self):
        self.db = isolated_database_module()
        self.pool = ControlledPool(1)
        self.db.connection_pool = self.pool
        self.db._connection_slots = threading.BoundedSemaphore(1)
        self.db.POOL_ACQUIRE_TIMEOUT_SECONDS = 1.0

    def test_sixteen_requests_wait_for_ten_connections_without_leaks(self):
        """Concurrent ASGI requests wait, then succeed without exceeding capacity."""
        self.pool = ControlledPool(10)
        self.db.connection_pool = self.pool
        gate = ObservedSemaphore(10, 16)
        self.db._connection_slots = gate
        release = threading.Event()

        # Materialize FastAPI's routes on one event loop before concurrent test
        # clients; each worker below creates its own ASGI loop, unlike a server.
        self.assertEqual(request(main.app, "/")[0], 200)

        def coverage_service():
            with self.db.get_pooled_connection():
                if not release.wait(2):
                    raise AssertionError("Test did not release connections")
                return routes.CoverageResponse(meta={}, data={
                    "total_indexed_papers": 0, "dated_papers": 0,
                    "undated_papers": 0, "tagged_papers": 0,
                    "untagged_papers": 0, "total_topics": 8,
                    "observed_date_from": None, "observed_date_to": None,
                    "latest_successful_etl_at": None,
                })

        with patch.object(routes, "get_coverage", side_effect=coverage_service), ThreadPoolExecutor(max_workers=16) as executor:
            futures = [executor.submit(request, main.app, "/intelligence/coverage") for _ in range(16)]
            try:
                self.assertTrue(gate.all_attempting.wait(1))
                self.assertTrue(self.pool.at_capacity.wait(1))
                self.assertEqual(self.pool.acquisitions, 10)
            finally:
                release.set()
            for future in futures:
                status, _ = future.result(timeout=2)
                self.assertEqual(status, 200)
        self.assertEqual(self.pool.maximum, 10)
        self.assertEqual(len(self.pool.returned), 16)
        self.assertFalse(self.pool.active)

    def test_waiter_acquires_after_connection_is_returned(self):
        """A waiter resumes when the holder leaves the context."""
        gate = ObservedSemaphore(1, 2)
        self.db._connection_slots = gate
        acquired = threading.Event()

        def waiter():
            with self.db.get_pooled_connection():
                acquired.set()

        with ThreadPoolExecutor(max_workers=1) as executor:
            with self.db.get_pooled_connection():
                future = executor.submit(waiter)
                self.assertTrue(gate.all_attempting.wait(1))
                self.assertFalse(acquired.is_set())
            future.result(timeout=2)
        self.assertTrue(acquired.is_set())
        self.assertFalse(self.pool.active)

    def test_capacity_timeout_does_not_checkout_or_leak(self):
        """Waiting expires and later acquisition still succeeds."""
        self.db.POOL_ACQUIRE_TIMEOUT_SECONDS = 0.01
        with self.db.get_pooled_connection():
            with self.assertRaises(DatabasePoolTimeout):
                with self.db.get_pooled_connection():
                    self.fail("Timed-out acquisition yielded a connection")
            self.assertEqual(self.pool.acquisitions, 1)
        with self.db.get_pooled_connection():
            pass
        self.assertFalse(self.pool.active)

    def test_checkout_failure_releases_permit(self):
        """Connection-open failures do not consume capacity permanently."""
        with patch.object(self.pool, "getconn", side_effect=RuntimeError("open failed")):
            with self.assertRaisesRegex(RuntimeError, "open failed"):
                with self.db.get_pooled_connection():
                    pass
        with self.db.get_pooled_connection():
            pass
        self.assertFalse(self.pool.active)

    def test_query_failures_rollback_and_return_connections(self):
        """Both read helpers return their checkout after cursor failures."""
        for helper in (self.db.fetch_one, self.db.fetch_all):
            with self.subTest(helper=helper.__name__):
                conn = MagicMock()
                conn.cursor.return_value.__enter__.return_value.execute.side_effect = RuntimeError("query failed")
                with patch.object(self.pool, "getconn", return_value=conn):
                    self.pool.active.add(conn)
                    with self.assertRaisesRegex(RuntimeError, "query failed"):
                        helper("select 1")
                conn.rollback.assert_called_once()
                self.assertFalse(self.pool.active)
                with self.db.get_pooled_connection():
                    pass

    def test_rollback_failure_still_returns_connection_and_permit(self):
        """Rollback exceptions cannot bypass the checkout's finally block."""
        with self.assertRaisesRegex(RuntimeError, "rollback failed"):
            with self.db.get_pooled_connection() as conn:
                conn.rollback.side_effect = RuntimeError("rollback failed")
                raise RuntimeError("query failed")
        self.assertFalse(self.pool.active)
        with self.db.get_pooled_connection():
            pass

    def test_return_failure_discards_connection_and_releases_permit(self):
        """A failed pool cleanup discards the connection rather than leaking it."""
        original = self.pool.putconn

        def return_connection(conn, close=False):
            if not close:
                raise RuntimeError("return rollback failed")
            original(conn, close=True)

        with patch.object(self.pool, "putconn", side_effect=return_connection):
            with self.assertRaisesRegex(RuntimeError, "return rollback failed"):
                with self.db.get_pooled_connection() as conn:
                    pass
        conn.close.assert_called_once()
        self.assertFalse(self.pool.active)
        with self.db.get_pooled_connection():
            pass

    def test_success_keeps_transaction_management_semantics(self):
        """Read contexts do not commit; execute_query retains its explicit commit."""
        with self.db.get_pooled_connection() as conn:
            pass
        conn.commit.assert_not_called()
        conn.rollback.assert_not_called()
        self.db.execute_query("controlled statement")
        self.pool.returned[-1][0].commit.assert_called_once()


class PoolHttpTests(unittest.TestCase):
    def test_legacy_route_wrapped_timeout_is_503(self):
        """Existing Explorer handlers use the same capacity error policy."""
        from app.routes import metrics
        with patch.object(metrics, "get_dashboard_metrics", side_effect=DatabasePoolTimeout("private details")):
            self.assertEqual(request(main.app, "/metrics"), (
                503, {"detail": "Database is temporarily busy. Please retry."},
            ))

    def test_timeout_response_advertises_retry_after(self):
        """Temporary unavailability retains JSON content type and a retry hint."""
        response = asyncio.run(main.pool_timeout_handler(None, DatabasePoolTimeout()))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers["retry-after"], "1")
        self.assertEqual(response.headers["content-type"], "application/json")

    def test_route_timeouts_are_structured_503(self):
        """Every intelligence route preserves pool unavailability as HTTP 503."""
        names = {
            "coverage": "get_coverage", "topics": "get_topic_options",
            "momentum": "get_momentum", "momentum-matrix": "get_momentum_matrix",
            "relationships": "get_relationships",
            "topic-category-heatmap": "get_topic_category_heatmap",
            "composition": "get_composition", "evidence": "get_evidence",
        }
        for path, function in names.items():
            with self.subTest(path=path), patch.object(routes, function, side_effect=DatabasePoolTimeout("private details")):
                self.assertEqual(request(main.app, "/intelligence/" + path), (
                    503, {"detail": "Database is temporarily busy. Please retry."},
                ))

    def test_dependency_timeouts_are_structured_503(self):
        """Topic and category validators preserve capacity timeout classification."""
        for path, query in (("momentum", "topic_id=1"), ("evidence", "topic_id=1"), ("evidence", "category=cs.AI")):
            with self.subTest(path=path, query=query), patch.object(filters, "fetch_all", side_effect=DatabasePoolTimeout("private details")):
                status, body = request(main.app, "/intelligence/" + path, query)
                self.assertEqual(status, 503)
                self.assertNotIn("private", str(body))

    def test_topic_database_failures_have_identical_generic_json(self):
        """Unexpected topic validation failures never expose database details."""
        for path in ("momentum", "evidence"):
            with self.subTest(path=path), patch.object(filters, "fetch_all", side_effect=RuntimeError("private database details")):
                self.assertEqual(request(main.app, "/intelligence/" + path, "topic_id=1"), (
                    500, {"detail": "Unable to validate topics."},
                ))

    def test_unknown_topics_remain_422(self):
        """Client validation is distinct from availability failures."""
        for path in ("momentum", "evidence"):
            with self.subTest(path=path), patch.object(filters, "fetch_all", return_value=[]):
                status, _ = request(main.app, "/intelligence/" + path, "topic_id=123")
                self.assertEqual(status, 422)
