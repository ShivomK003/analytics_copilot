from __future__ import annotations

import os
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extensions import connection
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

from backend.app.errors import DatabasePoolTimeout

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"


REQUIRED_DATABASE_VARIABLES = (
    "SUPABASE_HOST",
    "SUPABASE_PORT",
    "SUPABASE_DB",
    "SUPABASE_USER",
    "SUPABASE_PASSWORD",
)


def _database_config() -> dict[str, Any]:
    load_dotenv(ENV_PATH)
    missing_variables = [
        variable for variable in REQUIRED_DATABASE_VARIABLES if not os.getenv(variable)
    ]
    if missing_variables:
        missing = ", ".join(missing_variables)
        raise RuntimeError(f"Missing required database environment variables: {missing}")

    return {
        "host": os.environ["SUPABASE_HOST"],
        "port": os.environ["SUPABASE_PORT"],
        "dbname": os.environ["SUPABASE_DB"],
        "user": os.environ["SUPABASE_USER"],
        "password": os.environ["SUPABASE_PASSWORD"],
        "sslmode": os.getenv("SUPABASE_SSLMODE", "require"),
        "connect_timeout": 15,
        "cursor_factory": RealDictCursor,
    }


POOL_MAX_CONNECTIONS = 10
POOL_ACQUIRE_TIMEOUT_SECONDS = 30.0

_connection_pool: ThreadedConnectionPool | None = None
_pool_lock = Lock()


def initialize_connection_pool() -> ThreadedConnectionPool:
    """Open the process pool once, including for concurrent standalone callers."""
    global _connection_pool
    with _pool_lock:
        if _connection_pool is None:
            _connection_pool = ThreadedConnectionPool(
                minconn=1,
                maxconn=POOL_MAX_CONNECTIONS,
                **_database_config(),
            )
        return _connection_pool


# psycopg2 raises immediately at capacity. Gate every checkout instead so excess
# requests wait without polling or changing the pool's transaction semantics.
_connection_slots = BoundedSemaphore(POOL_MAX_CONNECTIONS)


def get_connection() -> connection:
    """
    Create a standalone database connection.

    Keep this for scripts such as deploy_views.py that explicitly
    control transactions and close the connection themselves.
    """

    return psycopg2.connect(**_database_config())


@contextmanager
def get_pooled_connection() -> Iterator[connection]:
    """Wait up to the capacity timeout, then borrow and always return a connection.

    This bounds semaphore waiting, not SQL execution or opening a new connection;
    the latter has a separate connect timeout.
    """
    if not _connection_slots.acquire(timeout=POOL_ACQUIRE_TIMEOUT_SECONDS):
        raise DatabasePoolTimeout("Database connection capacity wait expired.")
    try:
        pool = initialize_connection_pool()
        conn = pool.getconn()
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        finally:
            try:
                pool.putconn(conn)
            except Exception:
                # A failed rollback inside putconn must not retain a broken
                # checkout. Discard it through the pool's public API.
                conn.close()
                pool.putconn(conn, close=True)
                raise
    finally:
        # Release even if checkout, rollback, or return fails.
        _connection_slots.release()


def fetch_all(
    query: str,
    params: Sequence[Any] | None = None,
) -> list[dict[str, Any]]:
    """Execute a SELECT query and return all rows."""

    with get_pooled_connection() as conn, conn.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()

    return [dict(row) for row in rows]


def fetch_one(
    query: str,
    params: Sequence[Any] | None = None,
) -> dict[str, Any] | None:
    """Execute a SELECT query and return one row."""

    with get_pooled_connection() as conn, conn.cursor() as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone()

    return dict(row) if row is not None else None


def execute_query(
    query: str,
    params: Sequence[Any] | None = None,
) -> None:
    """Execute a data-changing or DDL statement and commit it."""

    with get_pooled_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute(query, params)

            conn.commit()

        except Exception:
            conn.rollback()
            raise


def close_connection_pool() -> None:
    """Close the process pool after callers have returned all checked-out connections."""
    global _connection_pool
    with _pool_lock:
        if _connection_pool is not None:
            _connection_pool.closeall()
            _connection_pool = None
