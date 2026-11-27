
from unittest.mock import patch

import numpy as np
import pytest
from backend.app.services.evidence.evidence_retrieval import (
    BEST_EVIDENCE_CHUNKS_SQL,
    INDEX_ID,
    retrieve_best_evidence_chunks,
)

MODULE = "backend.app.services.evidence.evidence_retrieval"


def make_chunk(paper_id, similarity=0.85, chunk_index=0):
    return {
        "paper_id": paper_id,
        "chunk_index": chunk_index,
        "chunk_text": f"Evidence from {paper_id}",
        "embedding": "[0.6,0.8]",
        "similarity": similarity,
    }


@pytest.fixture
def mocked_services():
    with (
        patch(f"{MODULE}.embed_query") as embed,
        patch(f"{MODULE}.fetch_all") as fetch,
    ):
        embed.return_value = "[1.0,0.0]"
        yield embed, fetch


def test_empty_paper_ids(mocked_services):
    embed, fetch = mocked_services

    assert retrieve_best_evidence_chunks("test query", []) == []

    embed.assert_not_called()
    fetch.assert_not_called()


def test_correct_database_parameters(mocked_services):
    embed, fetch = mocked_services
    fetch.return_value = []

    paper_ids = ["A", "B"]

    retrieve_best_evidence_chunks("test query", paper_ids)

    embed.assert_called_once_with("test query")

    fetch.assert_called_once_with(
        BEST_EVIDENCE_CHUNKS_SQL,
        ("[1.0,0.0]", INDEX_ID, paper_ids),
    )


def test_embedding_conversion(mocked_services):
    _, fetch = mocked_services
    fetch.return_value = [make_chunk("A")]

    results = retrieve_best_evidence_chunks("test query", ["A"])

    embedding = results[0]["embedding"]

    assert isinstance(embedding, np.ndarray)
    assert embedding.dtype == np.float32

    np.testing.assert_allclose(embedding, [0.6, 0.8])


def test_preserves_hybrid_order(mocked_services):
    _, fetch = mocked_services
    fetch.return_value = [
        make_chunk("A"),
        make_chunk("B"),
        make_chunk("C"),
    ]

    results = retrieve_best_evidence_chunks(
        "test query", ["C", "A", "B"]
    )

    assert [row["paper_id"] for row in results] == [
        "C", "A", "B"
    ]


def test_preserves_retrieval_rank(mocked_services):
    _, fetch = mocked_services
    fetch.return_value = [
        make_chunk("A"),
        make_chunk("C"),
    ]

    results = retrieve_best_evidence_chunks(
        "test query", ["C", "B", "A"]
    )

    assert [row["retrieval_rank"] for row in results] == [1, 3]


def test_preserves_chunk_metadata(mocked_services):
    _, fetch = mocked_services
    fetch.return_value = [
        make_chunk("A", similarity=0.92, chunk_index=2)
    ]

    results = retrieve_best_evidence_chunks("test query", ["A"])

    assert results[0]["paper_id"] == "A"
    assert results[0]["chunk_index"] == 2
    assert results[0]["chunk_text"] == "Evidence from A"
    assert results[0]["similarity"] == pytest.approx(0.92)


def test_handles_missing_embeddings(mocked_services):
    _, fetch = mocked_services
    fetch.return_value = [make_chunk("B")]

    results = retrieve_best_evidence_chunks(
        "test query", ["A", "B"]
    )

    assert len(results) == 1
    assert results[0]["paper_id"] == "B"
    assert results[0]["retrieval_rank"] == 2


def test_handles_empty_database_response(mocked_services):
    _, fetch = mocked_services
    fetch.return_value = []

    assert retrieve_best_evidence_chunks(
        "test query", ["A"]
    ) == []
