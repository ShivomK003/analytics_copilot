from __future__ import annotations

import os
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extensions import connection
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"

load_dotenv(ENV_PATH)


REQUIRED_DATABASE_VARIABLES = (
    "SUPABASE_HOST",
    "SUPABASE_PORT",
    "SUPABASE_DB",
    "SUPABASE_USER",
    "SUPABASE_PASSWORD",
)


def _validate_database_environment() -> None:
    """Raise an error when required database settings are missing."""

    missing_variables = [
        variable for variable in REQUIRED_DATABASE_VARIABLES if not os.getenv(variable)
    ]

    if missing_variables:
        missing = ", ".join(missing_variables)
        raise RuntimeError(
            f"Missing required database environment variables: {missing}"
        )


_validate_database_environment()


DATABASE_CONFIG = {
    "host": os.environ["SUPABASE_HOST"],
    "port": os.environ["SUPABASE_PORT"],
    "dbname": os.environ["SUPABASE_DB"],
    "user": os.environ["SUPABASE_USER"],
    "password": os.environ["SUPABASE_PASSWORD"],
    "sslmode": os.getenv("SUPABASE_SSLMODE", "require"),
    "connect_timeout": 15,
    "cursor_factory": RealDictCursor,
}


connection_pool = ThreadedConnectionPool(
    minconn=1,
    maxconn=10,
    **DATABASE_CONFIG,
)


def get_connection() -> connection:
    """
    Create a standalone database connection.

    Keep this for scripts such as deploy_views.py that explicitly
    control transactions and close the connection themselves.
    """

    return psycopg2.connect(**DATABASE_CONFIG)


@contextmanager
def get_pooled_connection() -> Iterator[connection]:
    """Borrow a reusable connection from the application pool."""

    conn = connection_pool.getconn()

    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        connection_pool.putconn(conn)


def fetch_all(
    query: str,
    params: Sequence[Any] | None = None,
) -> list[dict[str, Any]]:
    """Execute a SELECT query and return all rows."""

    with get_pooled_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()

    return [dict(row) for row in rows]


def fetch_one(
    query: str,
    params: Sequence[Any] | None = None,
) -> dict[str, Any] | None:
    """Execute a SELECT query and return one row."""

    with get_pooled_connection() as conn:
        with conn.cursor() as cursor:
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
    """Close every connection held by the pool."""

    connection_pool.closeall()
