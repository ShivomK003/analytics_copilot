
from unittest.mock import patch

import numpy as np
import pytest

from backend.app.services.evidence.evidence_assembly import assemble_evidence


MODULE = "backend.app.services.evidence.evidence_assembly"


def make_paper(paper_id):
    return {
        "paper_id": paper_id,
        "title": f"Paper {paper_id}",
        "abstract": f"Original abstract of {paper_id}",
        "primary_category": "cs.AI",
        "rrf_score": 0.025,
        "lexical_rank": 2,
        "semantic_rank": 3,
        "similarity": 0.5,
        "matching_chunk_index": 0,
        "matching_chunk": "Old approximate matching chunk",
    }


def make_chunk(paper_id, retrieval_rank=1):
    return {
        "paper_id": paper_id,
        "chunk_index": 1,
        "chunk_text": f"Exact evidence from {paper_id}",
        "embedding": np.array([0.6, 0.8], dtype=np.float32),
        "similarity": 0.85,
        "retrieval_rank": retrieval_rank,
    }


@pytest.fixture
def mocked_services():
    with (
        patch(f"{MODULE}.search_hybrid_papers") as hybrid,
        patch(f"{MODULE}.retrieve_best_evidence_chunks") as retrieve,
        patch(f"{MODULE}.select_mmr_evidence") as select,
    ):
        hybrid.return_value = [
            make_paper("A"),
            make_paper("B"),
            make_paper("C"),
            make_paper("D"),
            make_paper("E"),
        ]

        retrieve.return_value = [
            make_chunk("A", 1),
            make_chunk("B", 2),
            make_chunk("C", 3),
            make_chunk("D", 4),
            make_chunk("E", 5),
        ]

        select.return_value = [
            retrieve.return_value[2],
            retrieve.return_value[0],
        ]

        yield hybrid, retrieve, select


# -----------------------------------------
# Input validation
# -----------------------------------------


@pytest.mark.parametrize("query", ["", " ", "\n\t"])
def test_empty_query(query, mocked_services):
    hybrid, retrieve, select = mocked_services

    with pytest.raises(ValueError):
        assemble_evidence(query)

    hybrid.assert_not_called()
    retrieve.assert_not_called()
    select.assert_not_called()


@pytest.mark.parametrize(
    "candidate_limit,evidence_limit",
    [
        (0, 1),
        (20, 0),
        (5, 10),
        (101, 5),
        (-1, -1),
    ],
)
def test_invalid_limits(
    candidate_limit, evidence_limit, mocked_services
):
    hybrid, _, _ = mocked_services

    with pytest.raises(ValueError):
        assemble_evidence(
            "test query",
            candidate_limit=candidate_limit,
            evidence_limit=evidence_limit,
        )

    hybrid.assert_not_called()


@pytest.mark.parametrize(
    "weight", [-0.1, 1.1, float("nan")]
)
def test_invalid_relevance_weight(weight, mocked_services):
    hybrid, _, _ = mocked_services

    with pytest.raises(ValueError):
        assemble_evidence(
            "test query",
            relevance_weight=weight,
        )

    hybrid.assert_not_called()


# -----------------------------------------
# Pipeline orchestration
# -----------------------------------------


def test_default_pipeline_parameters(mocked_services):
    hybrid, retrieve, select = mocked_services

    assemble_evidence("test query")

    hybrid.assert_called_once_with("test query", 20)

    retrieve.assert_called_once_with(
        "test query", ["A", "B", "C", "D", "E"]
    )

    select.assert_called_once_with(
        retrieve.return_value, 5, 0.7
    )


def test_custom_pipeline_parameters(mocked_services):
    hybrid, retrieve, select = mocked_services

    assemble_evidence(
        "test query",
        candidate_limit=30,
        evidence_limit=3,
        relevance_weight=0.5,
    )

    hybrid.assert_called_once_with("test query", 30)

    select.assert_called_once_with(
        retrieve.return_value, 3, 0.5
    )


def test_query_stripped_but_case_preserved(mocked_services):
    hybrid, retrieve, _ = mocked_services

    result = assemble_evidence("  What is BERT?  ")

    hybrid.assert_called_once_with("What is BERT?", 20)

    retrieve.assert_called_once_with(
        "What is BERT?", ["A", "B", "C", "D", "E"]
    )

    assert result["query"] == "What is BERT?"


def test_equal_candidate_and_evidence_limits(mocked_services):
    hybrid, _, select = mocked_services

    assemble_evidence(
        "test query",
        candidate_limit=5,
        evidence_limit=5,
    )

    hybrid.assert_called_once_with("test query", 5)
    assert select.call_args.args[1] == 5


# -----------------------------------------
# Return contract and empty results
# -----------------------------------------


def test_return_structure(mocked_services):
    result = assemble_evidence("test query")

    assert isinstance(result, dict)

    assert set(result.keys()) == {
        "query",
        "selected_evidence",
        "remaining_candidates",
    }

    assert result["query"] == "test query"
    assert isinstance(result["selected_evidence"], list)
    assert isinstance(result["remaining_candidates"], list)


def test_no_candidate_papers(mocked_services):
    hybrid, retrieve, select = mocked_services
    hybrid.return_value = []

    result = assemble_evidence("test query")

    assert result == {
        "query": "test query",
        "selected_evidence": [],
        "remaining_candidates": [],
    }

    retrieve.assert_not_called()
    select.assert_not_called()


def test_no_evidence_chunks(mocked_services):
    hybrid, retrieve, select = mocked_services
    retrieve.return_value = []

    result = assemble_evidence("test query")

    assert result["selected_evidence"] == []
    assert result["remaining_candidates"] == hybrid.return_value

    select.assert_not_called()


def test_no_selected_evidence(mocked_services):
    hybrid, _, select = mocked_services
    select.return_value = []

    result = assemble_evidence("test query")

    assert result["selected_evidence"] == []
    assert result["remaining_candidates"] == hybrid.return_value


# -----------------------------------------
# Selected evidence and provenance
# -----------------------------------------


def test_preserves_mmr_selection_order(mocked_services):
    result = assemble_evidence("test query")

    assert [
        row["paper_id"]
        for row in result["selected_evidence"]
    ] == ["C", "A"]


def test_assigns_selection_rank(mocked_services):
    result = assemble_evidence("test query")

    assert [
        row["selection_rank"]
        for row in result["selected_evidence"]
    ] == [1, 2]


def test_preserves_retrieval_rank(mocked_services):
    result = assemble_evidence("test query")

    assert [
        row["retrieval_rank"]
        for row in result["selected_evidence"]
    ] == [3, 1]


def test_preserves_paper_metadata(mocked_services):
    result = assemble_evidence("test query")
    paper = result["selected_evidence"][0]

    assert paper["title"] == "Paper C"
    assert paper["abstract"] == "Original abstract of C"
    assert paper["primary_category"] == "cs.AI"
    assert paper["rrf_score"] == pytest.approx(0.025)
    assert paper["lexical_rank"] == 2
    assert paper["semantic_rank"] == 3


def test_preserves_exact_chunk_metadata(mocked_services):
    result = assemble_evidence("test query")
    paper = result["selected_evidence"][0]

    assert paper["chunk_index"] == 1
    assert paper["chunk_text"] == "Exact evidence from C"
    assert paper["similarity"] == pytest.approx(0.85)


def test_removes_embedding(mocked_services):
    result = assemble_evidence("test query")

    assert all(
        "embedding" not in row
        for row in result["selected_evidence"]
    )


def test_removes_old_semantic_chunk_metadata(mocked_services):
    result = assemble_evidence("test query")

    for row in result["selected_evidence"]:
        assert "matching_chunk" not in row
        assert "matching_chunk_index" not in row


# -----------------------------------------
# Recommendation candidate pool
# -----------------------------------------


def test_remaining_candidates_preserve_rrf_order(mocked_services):
    result = assemble_evidence("test query")

    assert [
        row["paper_id"]
        for row in result["remaining_candidates"]
    ] == ["B", "D", "E"]


def test_no_overlap_between_collections(mocked_services):
    result = assemble_evidence("test query")

    selected_ids = {
        row["paper_id"]
        for row in result["selected_evidence"]
    }

    remaining_ids = {
        row["paper_id"]
        for row in result["remaining_candidates"]
    }

    assert selected_ids.isdisjoint(remaining_ids)


def test_no_candidates_lost(mocked_services):
    hybrid, _, _ = mocked_services

    result = assemble_evidence("test query")

    original_ids = {
        row["paper_id"]
        for row in hybrid.return_value
    }

    selected_ids = {
        row["paper_id"]
        for row in result["selected_evidence"]
    }

    remaining_ids = {
        row["paper_id"]
        for row in result["remaining_candidates"]
    }

    assert selected_ids | remaining_ids == original_ids

    assert (
        len(result["selected_evidence"])
        + len(result["remaining_candidates"])
        == len(hybrid.return_value)
    )


def test_all_candidates_selected(mocked_services):
    _, retrieve, select = mocked_services

    select.return_value = retrieve.return_value

    result = assemble_evidence("test query")

    assert len(result["selected_evidence"]) == 5
    assert result["remaining_candidates"] == []


def test_partial_embedding_coverage(mocked_services):
    _, retrieve, select = mocked_services

    retrieve.return_value = [
        make_chunk("A", 1),
        make_chunk("C", 3),
    ]

    select.return_value = retrieve.return_value

    result = assemble_evidence("test query")

    assert [
        row["paper_id"]
        for row in result["selected_evidence"]
    ] == ["A", "C"]

    assert [
        row["paper_id"]
        for row in result["remaining_candidates"]
    ] == ["B", "D", "E"]


def test_remaining_candidates_preserve_metadata(mocked_services):
    hybrid, _, _ = mocked_services

    result = assemble_evidence("test query")

    assert result["remaining_candidates"] == [
        hybrid.return_value[1],
        hybrid.return_value[3],
        hybrid.return_value[4],
    ]


# -----------------------------------------
# Mutation safety
# -----------------------------------------


def test_does_not_mutate_original_papers(mocked_services):
    hybrid, _, _ = mocked_services

    assemble_evidence("test query")

    for paper in hybrid.return_value:
        assert paper["similarity"] == 0.5
        assert "matching_chunk" in paper
        assert "matching_chunk_index" in paper
        assert "selection_rank" not in paper


def test_does_not_mutate_original_chunks(mocked_services):
    _, retrieve, _ = mocked_services

    assemble_evidence("test query")

    for chunk in retrieve.return_value:
        assert "embedding" in chunk
        assert "selection_rank" not in chunk
