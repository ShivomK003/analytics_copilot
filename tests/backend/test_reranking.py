
"""Tests for cross-encoder reranking."""

import pytest

from backend.app.services.retrieval import reranking


class FakeReranker:
    def __init__(self, scores):
        self.scores = scores
        self.calls = []

    def predict(self, pairs, **kwargs):
        self.calls.append((pairs, kwargs))
        return self.scores


def test_reranking_changes_order(monkeypatch):
    candidates = [
        {
            "paper_id": "A",
            "title": "Paper A",
            "abstract": "Abstract A",
            "rrf_score": 0.032,
        },
        {
            "paper_id": "B",
            "title": "Paper B",
            "abstract": "Abstract B",
            "rrf_score": 0.030,
        },
        {
            "paper_id": "C",
            "title": "Paper C",
            "abstract": "Abstract C",
            "rrf_score": 0.028,
        },
    ]

    model = FakeReranker([0.3, 0.9, 0.6])

    monkeypatch.setattr(
        reranking,
        "search_hybrid_papers",
        lambda **kwargs: candidates,
    )
    monkeypatch.setattr(
        reranking,
        "get_reranker",
        lambda: model,
    )

    results = reranking.search_reranked_papers(
        "research query",
        limit=2,
    )

    assert [p["paper_id"] for p in results] == ["B", "C"]
    assert results[0]["rerank_score"] == pytest.approx(0.9)
    assert results[0]["rrf_score"] == 0.030

    assert len(model.calls) == 1
    pairs, options = model.calls[0]

    assert pairs[0] == (
        "research query",
        "Paper A\n\nAbstract A",
    )
    assert options["batch_size"] == 8


def test_empty_candidates_skip_model(monkeypatch):
    monkeypatch.setattr(
        reranking,
        "search_hybrid_papers",
        lambda **kwargs: [],
    )

    def unexpected_model_load():
        raise AssertionError("Model should not load")

    monkeypatch.setattr(
        reranking,
        "get_reranker",
        unexpected_model_load,
    )

    assert reranking.search_reranked_papers("query") == []


def test_equal_scores_use_rrf_tiebreak(monkeypatch):
    candidates = [
        {"paper_id": "A", "rrf_score": 0.02},
        {"paper_id": "B", "rrf_score": 0.03},
    ]

    monkeypatch.setattr(
        reranking,
        "search_hybrid_papers",
        lambda **kwargs: candidates,
    )
    monkeypatch.setattr(
        reranking,
        "get_reranker",
        lambda: FakeReranker([0.5, 0.5]),
    )

    results = reranking.search_reranked_papers(
        "query",
        limit=2,
    )

    assert [p["paper_id"] for p in results] == ["B", "A"]


@pytest.mark.parametrize(
    "query,limit",
    [
        ("", 10),
        ("   ", 10),
        ("valid", 0),
        ("valid", 101),
    ],
)
def test_invalid_inputs(query, limit):
    with pytest.raises(ValueError):
        reranking.search_reranked_papers(query, limit)
