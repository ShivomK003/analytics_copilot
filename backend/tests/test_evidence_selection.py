
import numpy as np
import pytest
from app.services.evidence_selection import (
    calculate_mmr_score,
    calculate_redundancy,
    select_mmr_evidence,
)


def make_candidate(embedding, similarity=0.85):
    return {
        "paper_id": "test-paper",
        "embedding": np.array(embedding, dtype=np.float32),
        "similarity": similarity,
    }


def test_redundancy_with_one_selected_paper():
    candidate = make_candidate([1.0, 0.0])
    selected = [make_candidate([0.6, 0.8])]

    assert calculate_redundancy(candidate, selected) == pytest.approx(0.6)


def test_redundancy_uses_maximum_similarity():
    candidate = make_candidate([1.0, 0.0])
    selected = [
        make_candidate([0.2, np.sqrt(0.96)]),
        make_candidate([0.9, np.sqrt(0.19)]),
        make_candidate([0.5, np.sqrt(0.75)]),
    ]

    assert calculate_redundancy(candidate, selected) == pytest.approx(0.9)


def test_redundancy_with_empty_selection():
    candidate = make_candidate([1.0, 0.0])

    assert calculate_redundancy(candidate, []) == pytest.approx(0.0)


def test_negative_redundancy_is_preserved():
    candidate = make_candidate([1.0, 0.0])
    selected = [
        make_candidate([-0.2, np.sqrt(0.96)]),
        make_candidate([-0.5, np.sqrt(0.75)]),
    ]

    assert calculate_redundancy(candidate, selected) == pytest.approx(-0.2)


def test_mmr_score_normal_calculation():
    candidate = make_candidate([1.0, 0.0], similarity=0.85)
    selected = [make_candidate([0.6, 0.8])]

    # 0.7 * 0.85 - 0.3 * 0.6 = 0.415
    assert calculate_mmr_score(
        candidate, selected, relevance_weight=0.7
    ) == pytest.approx(0.415)


def test_mmr_score_with_empty_selection():
    candidate = make_candidate([1.0, 0.0], similarity=0.85)

    # 0.7 * 0.85 = 0.595
    assert calculate_mmr_score(
        candidate, [], relevance_weight=0.7
    ) == pytest.approx(0.595)


@pytest.mark.parametrize("weight", [-0.1, 1.5])
def test_mmr_rejects_invalid_weights(weight):
    candidate = make_candidate([1.0, 0.0])

    with pytest.raises(ValueError):
        calculate_mmr_score(candidate, [], relevance_weight=weight)


def test_mmr_relevance_only():
    candidate = make_candidate([1.0, 0.0], similarity=0.85)
    selected = [make_candidate([0.6, 0.8])]

    assert calculate_mmr_score(
        candidate, selected, relevance_weight=1.0
    ) == pytest.approx(0.85)


def test_mmr_diversity_only():
    candidate = make_candidate([1.0, 0.0], similarity=0.85)
    selected = [make_candidate([0.6, 0.8])]

    assert calculate_mmr_score(
        candidate, selected, relevance_weight=0.0
    ) == pytest.approx(-0.6)


def test_mmr_prefers_diversity():
    candidates = [
        make_candidate([1.0, 0.0], similarity=0.95),
        make_candidate([0.9, np.sqrt(0.19)], similarity=0.90),
        make_candidate([0.0, 1.0], similarity=0.80),
    ]

    results = select_mmr_evidence(
        candidates, limit=2, relevance_weight=0.7
    )

    assert results[0] is candidates[0]
    assert results[1] is candidates[2]


def test_mmr_relevance_weight_changes_selection():
    candidates = [
        make_candidate([1.0, 0.0], similarity=0.95),
        make_candidate([0.9, np.sqrt(0.19)], similarity=0.90),
        make_candidate([0.0, 1.0], similarity=0.80),
    ]

    results = select_mmr_evidence(
        candidates, limit=2, relevance_weight=0.95
    )

    assert results[0] is candidates[0]
    assert results[1] is candidates[1]


def test_mmr_handles_empty_candidates():
    assert select_mmr_evidence([]) == []


def test_mmr_handles_fewer_candidates_than_limit():
    candidates = [
        make_candidate([1.0, 0.0], similarity=0.9),
        make_candidate([0.0, 1.0], similarity=0.8),
    ]

    results = select_mmr_evidence(candidates, limit=5)

    assert len(results) == 2


def test_mmr_preserves_original_candidates():
    candidates = [
        make_candidate([1.0, 0.0], similarity=0.9),
        make_candidate([0.0, 1.0], similarity=0.8),
    ]

    original_order = list(candidates)

    select_mmr_evidence(candidates, limit=2)

    assert all(
        actual is original
        for actual, original in zip(candidates, original_order)
    )


def test_mmr_handles_numpy_embedding_arrays():
    candidates = [
        make_candidate([1.0, 0.0], similarity=0.9),
        make_candidate([0.8, 0.6], similarity=0.85),
        make_candidate([0.0, 1.0], similarity=0.8),
    ]

    results = select_mmr_evidence(candidates, limit=3)

    assert len(results) == 3
    assert len({id(item) for item in results}) == 3
