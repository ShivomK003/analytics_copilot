
"""Semantic paper retrieval using MiniLM and pgvector."""

from functools import lru_cache
from typing import Any

from sentence_transformers import SentenceTransformer

from app.db import fetch_all, get_pooled_connection

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
INDEX_ID = (
    f"{MODEL_NAME}"
    "::chunk-200"
    "::overlap-30"
    "::normalized"
    "::v1"
)

MIN_CANDIDATE_CHUNKS = 100
MAX_CANDIDATE_CHUNKS = 800
CANDIDATE_MULTIPLIER = 4


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    """Load the query embedding model once per process."""
    return SentenceTransformer(MODEL_NAME)


def embed_query(query: str) -> str:
    """Encode a query as a normalized pgvector-compatible vector."""

    model = get_embedding_model()

    embedding = model.encode_query(
        query,
        normalize_embeddings=True,
    )

    return "[" + ",".join(map(str, embedding.tolist())) + "]"


# Retrieve a bounded pool of nearest chunks first.
# Deduplicate by paper before joining metadata.
HNSW_SEARCH_SQL = """
WITH candidates AS MATERIALIZED (
    SELECT
        e.paper_id,
        e.chunk_index,
        e.chunk_text,
        e.embedding <=> %s::extensions.vector AS distance
    FROM public.paper_embedding_chunks e
    WHERE e.model_name = %s
    ORDER BY e.embedding <=> %s::extensions.vector
    LIMIT %s
),
best_chunks AS (
    SELECT DISTINCT ON (paper_id)
        paper_id,
        chunk_index,
        chunk_text,
        distance
    FROM candidates
    ORDER BY paper_id, distance ASC, chunk_index ASC
)
SELECT
    p.paper_id,
    p.title,
    p.abstract,
    p.primary_category,
    p.published_date,
    p.updated_date,
    p.arxiv_url,
    p.pdf_url,
    COALESCE((
        SELECT ARRAY_AGG(
            DISTINCT t.topic_name ORDER BY t.topic_name
        )
        FROM public.paper_topics pt
        JOIN public.dim_topic t
            ON pt.topic_id = t.topic_id
        WHERE pt.paper_id = p.paper_id
    ), ARRAY[]::text[]) AS topics,
    1.0 - b.distance AS similarity,
    b.chunk_index AS matching_chunk_index,
    b.chunk_text AS matching_chunk
FROM best_chunks b
JOIN public.fact_papers p
    ON b.paper_id = p.paper_id
ORDER BY b.distance ASC, p.paper_id ASC
LIMIT %s
"""


# Preserve exhaustive retrieval as a fallback.
EXACT_SEARCH_SQL = """
WITH ranked_chunks AS (
    SELECT
        e.paper_id,
        e.chunk_index,
        e.chunk_text,
        e.embedding <=> %s::extensions.vector AS distance
    FROM public.paper_embedding_chunks e
    WHERE e.model_name = %s
),
best_chunks AS (
    SELECT DISTINCT ON (paper_id)
        paper_id,
        chunk_index,
        chunk_text,
        distance
    FROM ranked_chunks
    ORDER BY paper_id, distance ASC, chunk_index ASC
)
SELECT
    p.paper_id,
    p.title,
    p.abstract,
    p.primary_category,
    p.published_date,
    p.updated_date,
    p.arxiv_url,
    p.pdf_url,
    COALESCE((
        SELECT ARRAY_AGG(
            DISTINCT t.topic_name ORDER BY t.topic_name
        )
        FROM public.paper_topics pt
        JOIN public.dim_topic t
            ON pt.topic_id = t.topic_id
        WHERE pt.paper_id = p.paper_id
    ), ARRAY[]::text[]) AS topics,
    1.0 - b.distance AS similarity,
    b.chunk_index AS matching_chunk_index,
    b.chunk_text AS matching_chunk
FROM best_chunks b
JOIN public.fact_papers p
    ON b.paper_id = p.paper_id
ORDER BY b.distance ASC, p.paper_id ASC
LIMIT %s
"""

def _search_exact(
    query_vector: str,
    limit: int,
) -> list[dict[str, Any]]:
    return fetch_all(
        EXACT_SEARCH_SQL,
        (query_vector, INDEX_ID, limit),
    )

def _search_hnsw(
    query_vector: str,
    limit: int,
) -> list[dict[str, Any]]:
    candidate_count = min(
        max(
            MIN_CANDIDATE_CHUNKS,
            limit * CANDIDATE_MULTIPLIER,
        ),
        MAX_CANDIDATE_CHUNKS,
    )

    with get_pooled_connection() as conn, conn.cursor() as cursor:
        while True:
            # Transaction-local setting:
            # does not leak into later pooled requests.
            cursor.execute(
                "SELECT set_config("
                "'hnsw.ef_search', %s, true"
                ")",
                (str(candidate_count),),
            )

            cursor.execute(
                HNSW_SEARCH_SQL,
                (
                    query_vector,
                    INDEX_ID,
                    query_vector,
                    candidate_count,
                    limit,
                ),
            )

            rows = cursor.fetchall()

            if len(rows) >= limit:
                return rows

            if candidate_count >= MAX_CANDIDATE_CHUNKS:
                break

            candidate_count = min(
                candidate_count * 2,
                MAX_CANDIDATE_CHUNKS,
            )

    # Candidate retrieval could not fill the requested
    # result set. Use the exhaustive implementation.
    return _search_exact(query_vector, limit)


def search_semantic_papers(
    query: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    query = query.strip()

    if not query:
        raise ValueError(
            "Semantic search query cannot be empty."
        )

    if not 1 <= limit <= 100:
        raise ValueError(
            "limit must be between 1 and 100."
        )

    query_vector = embed_query(query)

    return _search_hnsw(query_vector, limit)
