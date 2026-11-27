
"""Unit tests for retrieval evaluation metrics."""

import pytest

from evaluation.retrieval.evaluate import (
    ndcg_at_k,
    precision_at_k,
)


def test_precision_at_five():
    grades = {"A": 2, "B": 1, "C": 0}

    assert precision_at_k(
        ["A", "B", "C"], grades
    ) == pytest.approx(0.4)


def test_perfect_ndcg():
    grades = {"A": 2, "B": 1, "C": 0}

    assert ndcg_at_k(
        ["A", "B", "C"], grades
    ) == pytest.approx(1.0)


def test_worse_ranking_has_lower_ndcg():
    grades = {"A": 2, "B": 1, "C": 0}

    perfect = ndcg_at_k(["A", "B", "C"], grades)
    worse = ndcg_at_k(["C", "B", "A"], grades)

    assert 0 <= worse < perfect


def test_no_relevant_papers():
    grades = {"A": 0, "B": 0}

    assert ndcg_at_k(["A", "B"], grades) == 0.0
    assert precision_at_k(["A", "B"], grades) == 0.0
