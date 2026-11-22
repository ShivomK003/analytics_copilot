
from fastapi.testclient import TestClient

from app.main import app
from app.routes import papers as papers_routes


client = TestClient(app)


def test_semantic_search_endpoint(monkeypatch):
    calls = []

    def fake_semantic_search(query, limit):
        calls.append((query, limit))
        return [
            {
                "paper_id": "2610.00001v1",
                "title": "Example Research Paper",
                "similarity": 0.85,
                "matching_chunk_index": 0,
                "matching_chunk": "Example matching text",
                "topics": ["llm"],
            }
        ]

    monkeypatch.setattr(
        papers_routes,
        "search_semantic_papers",
        fake_semantic_search,
    )

    response = client.get(
        "/papers/semantic-search",
        params={
            "query": "graph neural networks",
            "limit": 3,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 1
    assert data[0]["paper_id"] == "2610.00001v1"
    assert data[0]["similarity"] == 0.85
    assert data[0]["matching_chunk_index"] == 0
    assert calls == [("graph neural networks", 3)]


def test_semantic_search_validation():
    response = client.get(
        "/papers/semantic-search",
        params={
            "query": "machine learning",
            "limit": 101,
        },
    )

    assert response.status_code == 422


def test_semantic_search_database_failure(monkeypatch):
    def failing_search(query, limit):
        raise RuntimeError("Database unavailable")

    monkeypatch.setattr(
        papers_routes,
        "search_semantic_papers",
        failing_search,
    )

    response = client.get(
        "/papers/semantic-search",
        params={"query": "machine learning"},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Unable to perform semantic search."
    )


def test_existing_lexical_search_unchanged(monkeypatch):
    calls = []

    def fake_lexical_search(**kwargs):
        calls.append(kwargs)
        return [
            {
                "paper_id": "2610.00002v1",
                "title": "Lexical Search Result",
            }
        ]

    monkeypatch.setattr(
        papers_routes,
        "search_papers",
        fake_lexical_search,
    )

    response = client.get(
        "/papers/search",
        params={
            "query": "transformers",
            "sort": "relevance",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    assert response.json()[0]["title"] == (
        "Lexical Search Result"
    )
    assert calls[0]["query"] == "transformers"
    assert calls[0]["sort"] == "relevance"
    assert calls[0]["limit"] == 5
