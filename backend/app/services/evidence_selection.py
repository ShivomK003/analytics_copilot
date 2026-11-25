import numpy as np

def calculate_redundancy(candidate, selected):
    similarities = [
        np.dot(candidate["embedding"], paper["embedding"])
        for paper in selected
    ]

    return max(similarities, default=0.0)

def calculate_mmr_score(candidate, selected, relevance_weight=0.7):
    if not 0 <= relevance_weight <= 1:
        raise ValueError("relevance_weight must be between 0 and 1")

    redundancy_term = calculate_redundancy(candidate, selected)

    relevance_term = candidate["similarity"]

    mmr_score = relevance_weight * relevance_term - (1-relevance_weight) * redundancy_term

    return mmr_score

def select_mmr_evidence(
        candidates,
        limit=5,
        relevance_weight=0.7
):
    if not 0 <= relevance_weight <= 1:
            raise ValueError("relevance_weight must be between 0 and 1")

    if limit <= 0 or not candidates:
        return []

    selected = []
    remaining = list(candidates)

    while remaining and len(selected) < limit:
        if not selected:
            best_index = max(
                range(len(remaining)),
                key=lambda i: remaining[i]["similarity"]
            )
        else:
            best_index = max(
                range(len(remaining)),
                key=lambda i: calculate_mmr_score(
                    remaining[i],
                    selected,
                    relevance_weight
                )
            )

        best_candidate = remaining.pop(best_index)
        selected.append(best_candidate)

    return selected
