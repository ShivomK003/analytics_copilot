from typing import Any

from backend.app.services.evidence.evidence_retrieval import retrieve_best_evidence_chunks
from backend.app.services.evidence.evidence_selection import select_mmr_evidence
from backend.app.services.retrieval.hybrid_search import search_hybrid_papers

DEFAULT_CANDIDATE_LIMIT = 20
DEFAULT_EVIDENCE_LIMIT = 5
DEFAULT_RELEVANCE_WEIGHT = 0.7


def assemble_evidence(
    query: str,
    candidate_limit: int = DEFAULT_CANDIDATE_LIMIT,
    evidence_limit: int = DEFAULT_EVIDENCE_LIMIT,
    relevance_weight: float = DEFAULT_RELEVANCE_WEIGHT,
) -> dict[str, Any]:

    query = query.strip()

    if not query:
        raise ValueError("Query cannot be empty.")

    if not 1 <= evidence_limit <= candidate_limit <= 100:
        raise ValueError(
            "Limits must satisfy "
            "1 <= evidence_limit <= candidate_limit <= 100."
        )

    if not 0 <= relevance_weight <= 1:
        raise ValueError("Relevance weight must be between 0 and 1.")

    candidate_papers = search_hybrid_papers(query, candidate_limit)

    if not candidate_papers:
        return {
            "query": query,
            "selected_evidence": [],
            "remaining_candidates": [],
        }

    candidate_paper_lookup = {
        paper['paper_id']: paper
        for paper in candidate_papers
    }

    candidate_paper_ids = [paper['paper_id'] for paper in candidate_papers]
    best_evidence_chunks = retrieve_best_evidence_chunks(query, candidate_paper_ids)

    if not best_evidence_chunks:
        return {
            "query": query,
            "selected_evidence": [],
            "remaining_candidates": candidate_papers,
        }

    mmr_selected_chunks = select_mmr_evidence(best_evidence_chunks, evidence_limit, relevance_weight)

    assembled_evidence = []
    for rank, chunk in enumerate(mmr_selected_chunks, start=1):
        paper = candidate_paper_lookup[chunk["paper_id"]]

        merged = {**paper, **chunk}

        merged["selection_rank"] = rank

        merged.pop("embedding", None)
        merged.pop("matching_chunk_index", None)
        merged.pop("matching_chunk", None)

        assembled_evidence.append(merged)

    evidence_paper_ids = {
        paper["paper_id"]
        for paper in assembled_evidence
    }

    remaining_candidates = [
        paper
        for paper in candidate_papers
        if paper['paper_id'] not in evidence_paper_ids
    ]

    return {
        "query": query,
        "selected_evidence": assembled_evidence,
        "remaining_candidates": remaining_candidates
    }
