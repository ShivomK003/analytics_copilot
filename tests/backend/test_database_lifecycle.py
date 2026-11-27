"""Database lifecycle checks that run without credentials or network access."""

import asyncio
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import MagicMock, patch

import pytest

from backend.app import db, main


def test_api_and_scripts_import_without_reading_db_config_or_connecting():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            """
from unittest.mock import patch

with (
    patch("dotenv.load_dotenv", side_effect=AssertionError("loaded dotenv at import")),
    patch("psycopg2.connect", side_effect=AssertionError("connected at import")),
    patch("psycopg2.pool.ThreadedConnectionPool", side_effect=AssertionError("opened pool at import")),
):
    from backend.app.main import app
    from scripts import deploy_views, validate_dashboard_api, validate_views
    assert app.title
""",
        ],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr


@pytest.fixture
def pool_factory(monkeypatch):
    monkeypatch.setattr(db, "_connection_pool", None)
    monkeypatch.setattr(db, "_database_config", lambda: {"host": "test.invalid"})
    with patch.object(db, "ThreadedConnectionPool") as factory:
        yield factory
        db.close_connection_pool()


def test_concurrent_standalone_checkouts_share_one_lazy_pool(pool_factory):
    ready = Barrier(4)
    pool = pool_factory.return_value

    def query():
        ready.wait(timeout=5)
        db.fetch_one("select 1")

    assert not pool_factory.called
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(query) for _ in range(4)]
        for future in futures:
            future.result(timeout=5)

    pool_factory.assert_called_once_with(
        minconn=1, maxconn=db.POOL_MAX_CONNECTIONS, host="test.invalid"
    )
    assert pool.getconn.call_count == pool.putconn.call_count == 4


def test_failed_initialization_can_be_retried(pool_factory):
    pool_factory.side_effect = [RuntimeError("startup failed"), pool_factory.return_value]
    with pytest.raises(RuntimeError, match="startup failed"):
        db.fetch_one("select 1")

    db.fetch_one("select 1")
    assert pool_factory.call_count == 2
    pool_factory.return_value.putconn.assert_called_once()


def test_lifespan_starts_and_closes_a_fresh_pool_even_after_failure(pool_factory):
    first_pool, second_pool = MagicMock(), MagicMock()
    pool_factory.side_effect = [first_pool, second_pool]

    async def run():
        with pytest.raises(RuntimeError, match="application failed"):
            async with main.app.router.lifespan_context(main.app):
                assert db._connection_pool is first_pool
                raise RuntimeError("application failed")
        first_pool.closeall.assert_called_once()

        # Repeated cleanup is safe and the next startup gets a fresh pool.
        db.close_connection_pool()
        first_pool.closeall.assert_called_once()
        async with main.app.router.lifespan_context(main.app):
            assert db._connection_pool is second_pool
        second_pool.closeall.assert_called_once()

    asyncio.run(run())
    assert pool_factory.call_count == 2


def test_standalone_connection_does_not_create_pool(pool_factory):
    with patch.object(db.psycopg2, "connect") as connect:
        assert db.get_connection() is connect.return_value
    connect.assert_called_once_with(host="test.invalid")
    pool_factory.assert_not_called()
