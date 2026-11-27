
"""Cross-encoder reranking for hybrid research retrieval."""

from functools import lru_cache
from typing import Any

from sentence_transformers import CrossEncoder

from backend.app.services.retrieval.hybrid_search import search_hybrid_papers

RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"
MIN_RERANK_CANDIDATES = 30


@lru_cache(maxsize=1)
def get_reranker() -> CrossEncoder:
    """Load the reranker once, on first use."""
    return CrossEncoder(
        RERANKER_MODEL,
        max_length=512,
    )


def search_reranked_papers(
    query: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Retrieve hybrid candidates and rerank with BGE."""

    query = query.strip()

    if not query:
        raise ValueError("Search query cannot be empty.")

    if not 1 <= limit <= 100:
        raise ValueError("Limit must be between 1 and 100.")

    candidate_limit = max(
        MIN_RERANK_CANDIDATES,
        limit,
    )

    candidates = search_hybrid_papers(
        query=query,
        limit=candidate_limit,
    )

    if not candidates:
        return []

    pairs = [
        (
            query,
            (
                f"{paper.get('title') or ''}\n\n"
                f"{paper.get('abstract') or ''}"
            ),
        )
        for paper in candidates
    ]

    scores = get_reranker().predict(
        pairs,
        batch_size=8,
        show_progress_bar=False,
    )

    reranked = [
        {
            **paper,
            "rerank_score": float(score),
        }
        for paper, score in zip(candidates, scores, strict=True)
    ]

    reranked.sort(
        key=lambda paper: (
            -paper["rerank_score"],
            -paper["rrf_score"],
            paper["paper_id"],
        )
    )

    return reranked[:limit]
