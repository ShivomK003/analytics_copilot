
"""Tests for hybrid paper retrieval and RRF fusion."""

import pytest
from backend.app.services.retrieval import hybrid_search


def test_rrf_fuses_and_deduplicates(monkeypatch):
    lexical = [
        {"paper_id": "A", "title": "Paper A"},
        {"paper_id": "B", "title": "Paper B"},
        {"paper_id": "C", "title": "Paper C"},
    ]

    semantic = [
        {
            "paper_id": "B",
            "title": "Paper B",
            "similarity": 0.9,
            "matching_chunk": "Relevant evidence B",
        },
        {
            "paper_id": "C",
            "title": "Paper C",
            "similarity": 0.8,
            "matching_chunk": "Relevant evidence C",
        },
        {
            "paper_id": "D",
            "title": "Paper D",
            "similarity": 0.7,
            "matching_chunk": "Relevant evidence D",
        },
    ]

    monkeypatch.setattr(
        hybrid_search,
        "search_papers",
        lambda **kwargs: lexical,
    )

    monkeypatch.setattr(
        hybrid_search,
        "search_semantic_papers",
        lambda **kwargs: semantic,
    )

    results = hybrid_search.search_hybrid_papers(
        "molecular graphs",
        limit=4,
    )

    assert [p["paper_id"] for p in results] == [
        "B", "C", "A", "D"
    ]

    assert len({p["paper_id"] for p in results}) == 4

    assert results[0]["lexical_rank"] == 2
    assert results[0]["semantic_rank"] == 1

    expected = 1 / 62 + 1 / 61

    assert results[0]["rrf_score"] == pytest.approx(expected)

    assert results[0]["similarity"] == 0.9
    assert results[0]["matching_chunk"] == "Relevant evidence B"

    assert results[2]["semantic_rank"] is None
    assert results[3]["lexical_rank"] is None


def test_candidate_budget(monkeypatch):
    calls = []

    def fake_lexical(**kwargs):
        calls.append(("lexical", kwargs["limit"]))
        return []

    def fake_semantic(**kwargs):
        calls.append(("semantic", kwargs["limit"]))
        return []

    monkeypatch.setattr(
        hybrid_search, "search_papers", fake_lexical
    )
    monkeypatch.setattr(
        hybrid_search, "search_semantic_papers", fake_semantic
    )

    hybrid_search.search_hybrid_papers("test", limit=10)

    assert calls == [
        ("lexical", 50),
        ("semantic", 50),
    ]

    calls.clear()

    hybrid_search.search_hybrid_papers("test", limit=100)

    assert calls == [
        ("lexical", 100),
        ("semantic", 100),
    ]


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
        hybrid_search.search_hybrid_papers(
            query,
            limit=limit,
        )
