
import pytest

from backend.app.services.retrieval import semantic_search as service


class FakeCursor:
    def __init__(self, batches):
        self.batches = iter(batches)
        self.calls = []

    def execute(self, sql, params):
        self.calls.append((sql, params))

    def fetchall(self):
        return next(self.batches)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeConnection:
    def __init__(self, cursor):
        self.fake_cursor = cursor

    def cursor(self):
        return self.fake_cursor

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def papers(count):
    return [
        {"paper_id": f"paper-{i}", "similarity": 0.9}
        for i in range(count)
    ]


def setup_database(monkeypatch, batches):
    cursor = FakeCursor(batches)

    monkeypatch.setattr(
        service,
        "get_pooled_connection",
        lambda: FakeConnection(cursor),
    )

    monkeypatch.setattr(
        service,
        "embed_query",
        lambda query: "[0.1,0.2,0.3]",
    )

    return cursor


def test_hnsw_returns_requested_results(monkeypatch):
    cursor = setup_database(monkeypatch, [papers(10)])

    def unexpected_exact(*args):
        pytest.fail("Exact fallback should not run")

    monkeypatch.setattr(
        service, "_search_exact", unexpected_exact
    )

    results = service.search_semantic_papers("LLM research", 10)

    assert len(results) == 10

    search_calls = [
        params for sql, params in cursor.calls
        if "WITH candidates AS MATERIALIZED" in sql
    ]

    assert len(search_calls) == 1
    assert search_calls[0][3] == 100
    assert search_calls[0][4] == 10


def test_hnsw_expands_candidate_pool(monkeypatch):
    cursor = setup_database(
        monkeypatch,
        [papers(5), papers(10)],
    )

    results = service.search_semantic_papers("LLM research", 10)

    assert len(results) == 10

    budgets = [
        params[3]
        for sql, params in cursor.calls
        if "WITH candidates AS MATERIALIZED" in sql
    ]

    assert budgets == [100, 200]


def test_hnsw_falls_back_when_pool_exhausted(monkeypatch):
    cursor = setup_database(
        monkeypatch,
        [papers(5)] * 4,
    )

    fallback_calls = []

    def fake_exact(vector, limit):
        fallback_calls.append((vector, limit))
        return papers(limit)

    monkeypatch.setattr(
        service, "_search_exact", fake_exact
    )

    results = service.search_semantic_papers("LLM research", 10)

    assert len(results) == 10
    assert len(fallback_calls) == 1

    budgets = [
        params[3]
        for sql, params in cursor.calls
        if "WITH candidates AS MATERIALIZED" in sql
    ]

    assert budgets == [100, 200, 400, 800]


@pytest.mark.parametrize(
    "query,limit",
    [
        ("", 10),
        ("   ", 10),
        ("LLM", 0),
        ("LLM", 101),
    ],
)
def test_invalid_search_arguments(query, limit):
    with pytest.raises(ValueError):
        service.search_semantic_papers(query, limit)
