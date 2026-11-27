
"""Hybrid lexical and semantic paper retrieval using RRF."""

from typing import Any

from backend.app.services.retrieval.paper_service import search_papers
from backend.app.services.retrieval.semantic_search import search_semantic_papers


RRF_K = 60
CANDIDATE_LIMIT = 50

def search_hybrid_papers(
        query: str, 
        limit: int = 10
) -> list[dict[str, Any]]:
    """Fuse lexical and semantic rankings at paper level."""

    query = query.strip()

    if not query:
        raise ValueError("Search query cannot be empty")

    if not 1 <= limit <= 100:
        raise ValueError("Limit must be between 1 and 100")

    candidate_limit = max(CANDIDATE_LIMIT, limit)

    lexical_results = search_papers(
        query=query,
        sort="relevance",
        limit=candidate_limit,
        offset=0
    )

    semantic_results = search_semantic_papers(
        query=query,
        limit=candidate_limit,
    )

    fused: dict[str, dict[str, Any]] = {}

    for source, results in (
        ("lexical", lexical_results),
        ("semantic", semantic_results)
    ):
        for rank, paper in enumerate(results, start=1):
            paper_id = paper["paper_id"]

            if paper_id not in fused:
                fused[paper_id] = {
                    **paper,
                    "rrf_score": 0.0,
                    "lexical_rank": None,
                    "semantic_rank": None,
                }

            entry = fused[paper_id]

            if source == "semantic":
                # Retain the matching evidence from semantic retrieval.
                entry.update(paper)

            entry["rrf_score"] += 1.0 / (RRF_K + rank)
            entry[f"{source}_rank"] = rank

    ranked = sorted(
        fused.values(),
        key=lambda paper: (
            -paper["rrf_score"],
            paper["paper_id"],
        ),
    )

    return ranked[:limit]
     