from collections.abc import Callable
from typing import Any

TokenCounter = Callable[[str], int]

DEFAULT_RECOMMENDATION_LIMIT = 5

def format_evidence(
    paper: dict[str, Any],
    source_id: str
) -> str:
    return (
        f"[{source_id}]\n"
        f"Paper ID: {paper['paper_id']}\n"
        f"Title: {paper['title']}\n"
        f"Abstract: {paper['abstract']}"
    )

def pack_primary_evidence(
    papers: list[dict[str, Any]],
    budget: int,
    count_tokens: TokenCounter,
) -> dict[str, Any]:

    if budget < 0:
        raise ValueError("Budget cannot be negative")

    included_papers, overflow_papers, evidence_blocks = [], [], []
    total_budget_used = 0

    for paper in papers:
        source_id = f"S{len(included_papers) + 1}"
        formatted_paper = format_evidence(paper, source_id)
        context = "\n\n".join(evidence_blocks + [formatted_paper])
        token_count = count_tokens(context)

        if token_count > budget:
            overflow_papers.append(paper)
            continue


        total_budget_used = token_count
        included_papers.append({
            **paper,
            "source_id": source_id,
        })
        evidence_blocks.append(formatted_paper)

    unused_budget = budget - total_budget_used

    return {
        "included_papers": included_papers,
        "overflow_papers": overflow_papers,
        "context": "\n\n".join(evidence_blocks),
        "tokens_used": total_budget_used,
        "unused_budget": unused_budget
    }

def select_recommendations(
    papers: list[dict[str, Any]],
    limit: int = DEFAULT_RECOMMENDATION_LIMIT
) -> list[dict[str, Any]]:

    if limit < 0:
        raise ValueError("Limit must be non-negative")

    return papers[:limit]

def build_source_registry(
    included_papers: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:

    keys = (
        "paper_id",
        "title",
        "arxiv_url",
        "pdf_url",
        "selection_rank",
        "retrieval_rank",
        "chunk_index",
        "similarity",
    )

    return {
        paper["source_id"]: {
            key: paper[key]
            for key in keys
        }
        for paper in included_papers
    }


def build_evidence_context(
    assembly_result: dict[str, Any],
    total_budget: int,
    count_tokens: TokenCounter,
    recommendation_limit: int = DEFAULT_RECOMMENDATION_LIMIT,
) -> dict[str, Any]:

    selected_evidence, remaining_candidates = assembly_result["selected_evidence"], assembly_result["remaining_candidates"]

    evidence_packed_result = pack_primary_evidence(selected_evidence, total_budget, count_tokens)

    recommendation_pool = (
        evidence_packed_result["overflow_papers"]
        + remaining_candidates
    )

    recommendations = select_recommendations(
        recommendation_pool, recommendation_limit
    )

    return {
        "query": assembly_result["query"],
        "primary": evidence_packed_result,
        "recommendations": recommendations,
        "source_registry": build_source_registry(
            evidence_packed_result["included_papers"]
        ),
    }
