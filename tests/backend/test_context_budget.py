
import pytest

from backend.app.services.agent.context_budget import calculate_evidence_budget


# ----------------------------------------
# Basic budget calculation
# ----------------------------------------


def test_calculate_budget_without_cap():
    assert calculate_evidence_budget(
        context_window=8192,
        completion_budget=2048,
        fixed_prompt_tokens=300,
        formatting_allowance=100,
    ) == 5744


def test_calculate_budget_with_explicit_none_cap():
    assert calculate_evidence_budget(
        8192, 2048, 300, 100, None
    ) == 5744


def test_zero_fixed_prompt_tokens():
    assert calculate_evidence_budget(
        8192, 2048, 0, 100
    ) == 6044


def test_zero_formatting_allowance():
    assert calculate_evidence_budget(
        8192, 2048, 300, 0
    ) == 5844


def test_zero_prompt_and_formatting_tokens():
    assert calculate_evidence_budget(
        8192, 2048, 0, 0
    ) == 6144


# ----------------------------------------
# Evidence cap
# ----------------------------------------


@pytest.mark.parametrize(
    "evidence_cap, expected",
    [
        (4000, 4000),
        (10000, 5744),
        (5744, 5744),
        (0, 0),
        (1, 1),
    ],
)
def test_evidence_cap(evidence_cap, expected):
    assert calculate_evidence_budget(
        8192, 2048, 300, 100, evidence_cap
    ) == expected


# ----------------------------------------
# Boundary conditions
# ----------------------------------------


def test_exactly_zero_available_budget():
    assert calculate_evidence_budget(
        4096, 2048, 1948, 100
    ) == 0


def test_zero_available_budget_with_positive_cap():
    assert calculate_evidence_budget(
        4096, 2048, 1948, 100, 1000
    ) == 0


def test_zero_available_budget_with_zero_cap():
    assert calculate_evidence_budget(
        4096, 2048, 1948, 100, 0
    ) == 0


def test_one_token_available():
    assert calculate_evidence_budget(
        4096, 2048, 1947, 100
    ) == 1


def test_minimum_valid_context_window():
    assert calculate_evidence_budget(
        1, 1, 0, 0
    ) == 0


def test_reserved_tokens_exceed_context_by_one():
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            4096, 2048, 1949, 100
        )


def test_completion_budget_exceeds_context():
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            1024, 2048, 0, 0
        )


def test_fixed_prompt_exceeds_context():
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            4096, 1024, 5000, 0
        )


def test_formatting_allowance_exceeds_context():
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            4096, 1024, 100, 5000
        )


def test_cap_does_not_hide_invalid_configuration():
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            1024, 2048, 300, 100, 0
        )


# ----------------------------------------
# Input validation
# ----------------------------------------


@pytest.mark.parametrize(
    "context_window",
    [0, -1, -8192],
)
def test_invalid_context_window(context_window):
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            context_window, 2048, 300, 100
        )


@pytest.mark.parametrize(
    "completion_budget",
    [0, -1, -2048],
)
def test_invalid_completion_budget(completion_budget):
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            8192, completion_budget, 300, 100
        )


@pytest.mark.parametrize("fixed_prompt_tokens", [-1, -300])
def test_invalid_fixed_prompt_tokens(fixed_prompt_tokens):
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            8192, 2048, fixed_prompt_tokens, 100
        )


@pytest.mark.parametrize("formatting_allowance", [-1, -100])
def test_invalid_formatting_allowance(formatting_allowance):
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            8192, 2048, 300, formatting_allowance
        )


@pytest.mark.parametrize("evidence_cap", [-1, -4000])
def test_invalid_evidence_cap(evidence_cap):
    with pytest.raises(ValueError):
        calculate_evidence_budget(
            8192, 2048, 300, 100, evidence_cap
        )


# ----------------------------------------
# Budget invariants
# ----------------------------------------


@pytest.mark.parametrize(
    "context_window, completion, prompt, overhead, cap",
    [
        (8192, 2048, 300, 100, None),
        (8192, 2048, 300, 100, 4000),
        (4096, 2048, 1948, 100, None),
        (131072, 4096, 500, 200, 8000),
        (8192, 2048, 300, 100, 0),
    ],
)
def test_budget_never_exceeds_context(
    context_window, completion, prompt, overhead, cap
):
    budget = calculate_evidence_budget(
        context_window,
        completion,
        prompt,
        overhead,
        cap,
    )

    assert budget >= 0

    assert (
        budget + completion + prompt + overhead
        <= context_window
    )

    if cap is not None:
        assert budget <= cap
