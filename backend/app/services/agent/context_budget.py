def calculate_evidence_budget(
    context_window: int,
    completion_budget: int,
    fixed_prompt_tokens: int,
    formatting_allowance: int,
    evidence_cap: int | None = None,
) -> int:
    if context_window <= 0:
        raise ValueError("Context window must be positive")

    if completion_budget <= 0:
        raise ValueError("Completion budget must be positive")

    if fixed_prompt_tokens < 0:
        raise ValueError("Fixed prompt tokens must be non-negative")

    if formatting_allowance < 0:
        raise ValueError("Formatting allowance must be non-negative")

    if evidence_cap is not None and evidence_cap < 0:
        raise ValueError("Evidence cap must be non-negative")

    evidence_budget = (
        context_window
        - completion_budget
        - fixed_prompt_tokens
        - formatting_allowance
    )

    if evidence_budget < 0:
        raise ValueError(
            "The reserved tokens exceed the context window. "
            "Please reconfigure the budget structure."
        )

    if evidence_cap is None:
        return evidence_budget

    return min(evidence_budget, evidence_cap)