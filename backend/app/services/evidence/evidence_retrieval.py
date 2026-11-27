from typing import Any

import numpy as np

from backend.app.db import fetch_all
from backend.app.services.retrieval.semantic_search import embed_query
from database.embedding_config import INDEX_ID

BEST_EVIDENCE_CHUNKS_SQL = """
WITH ranked_chunks AS (
    SELECT
        e.paper_id,
        e.chunk_index,
        e.chunk_text,
        e.embedding::text AS embedding,
        e.embedding <=> %s::extensions.vector AS distance
    FROM public.paper_embedding_chunks e
    WHERE e.model_name = %s
      AND e.paper_id = ANY(%s::text[])
      AND e.embedding IS NOT NULL
)

SELECT DISTINCT ON (paper_id)
    paper_id,
    chunk_index,
    chunk_text,
    embedding,
    1 - distance as similarity
FROM ranked_chunks
ORDER BY paper_id, distance ASC, chunk_index ASC
"""

def retrieve_best_evidence_chunks(
        query: str,
        paper_ids: list[str],
) -> list[dict[str, Any]]:

    if not paper_ids:
        return []

    query_embedding = embed_query(query)

    best_evidence_chunks = fetch_all(
        BEST_EVIDENCE_CHUNKS_SQL,
        (query_embedding, INDEX_ID, paper_ids)
    )

    # Convert Embedding strings back to Numpy Array
    for row in best_evidence_chunks:
        row["embedding"] = np.fromstring(
            row["embedding"].strip("[]"),
            sep=",",
            dtype=np.float32
        )

    # Restore original Hybrid RRF ordering
    paper_id_rank_record = {
        paper_id: rank
        for rank, paper_id in enumerate(paper_ids, start=1)
    }

    best_evidence_chunks.sort(
        key=lambda row: paper_id_rank_record[row["paper_id"]]
    )

    for row in best_evidence_chunks:
        row["retrieval_rank"] = paper_id_rank_record[row["paper_id"]]

    return best_evidence_chunks
