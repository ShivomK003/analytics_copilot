import math

from psycopg2.extras import RealDictCursor


def keyword_search(conn, query, paper_ids, top_k=10):
    search_query = """
        SELECT
            paper_id,
            title,
            ts_rank(
                to_tsvector(
                    'english',
                    COALESCE(title, '') || ' ' || COALESCE(abstract, '')
                ),
                plainto_tsquery('english', %s)
            ) AS score
        FROM public.fact_papers
        WHERE paper_id = ANY(%s)
        AND to_tsvector(
                'english',
                COALESCE(title, '') || ' ' || COALESCE(abstract, '')
            ) @@ plainto_tsquery('english', %s)
        ORDER BY score DESC, paper_id
        LIMIT %s;
    """

    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            search_query,
            (
                query,
                paper_ids,
                query,
                top_k,
            )
        )

        rows = cursor.fetchall()

    return rows


def flexible_keyword_search(conn, query, paper_ids, top_k=10):
    terms = query.split()
    or_query = " OR ".join(terms)

    search_query = """
            SELECT
                paper_id,
                title,
                ts_rank(
                    to_tsvector(
                        'english',
                        COALESCE(title, '') || ' ' || COALESCE(abstract, '')
                    ),
                    websearch_to_tsquery('english', %s)
                ) AS score
            FROM public.fact_papers
            WHERE paper_id = ANY(%s)
            AND to_tsvector(
                    'english',
                    COALESCE(title, '') || ' ' || COALESCE(abstract, '')
                ) @@ websearch_to_tsquery('english', %s)
            ORDER BY score DESC, paper_id
            LIMIT %s;
        """
    
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                search_query,
                (
                    or_query,
                    paper_ids,
                    or_query,
                    top_k,
                )
            )
    
            rows = cursor.fetchall()
    
    return rows

def semantic_search(conn, query, paper_ids, model, model_name, top_k=10):
    search_sqlquery = """
        SELECT
            paper_id,
            MAX(1 - (embedding <=> %s::extensions.vector)) AS score
        FROM public.paper_embedding_chunks
        WHERE model_name = %s
        AND paper_id = ANY(%s)
        GROUP BY paper_id
        ORDER BY score DESC, paper_id
        LIMIT %s;
    """

    query_embeddings = model.encode_query(query, normalize_embeddings=True)
    vector_string = "[" + ",".join(map(str, query_embeddings)) + "]"

    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            search_sqlquery,
            (
                vector_string, 
                model_name,
                paper_ids,
                top_k
            )
        )

        rows = cursor.fetchall()

    return rows
 

def reciprocal_rank_fusion(keyword_results, semantic_results, k=60):
    rrf_scores = {}

    ## KEYWORD SEARCH CONTRIBUTION
    for rank, result in enumerate(keyword_results, start=1):
        paper_id = result["paper_id"]

        rrf_scores[paper_id] = rrf_scores.get(paper_id, 0) + 1 / (k + rank)

    ## SEMANTIC SEARCH CONTRIBUTION
    for rank, result in enumerate(semantic_results, start=1):
        paper_id = result['paper_id']

        rrf_scores[paper_id] = rrf_scores.get(paper_id, 0) + 1 / (k + rank)

    sorted_scores = sorted(
        rrf_scores.items(),
        key=lambda item: (-item[1], item[0])
    )

    return [
    {"paper_id": paper_id, "rrf_score": score}
    for paper_id, score in sorted_scores
]


def precision_at_k(results, judgments, k=5):
    precisionk_count = 0
    for result in results[:k]:
        if judgments.get(result['paper_id'], 0) > 0:
                precisionk_count += 1
    if k > 0:
        precisionk = precisionk_count / float(k)
        return precisionk
    else:
        raise ValueError("k has to be positive number")

def recall_at_k(results, judgments, k=5):
    recallk_count = 0
    for result in results[:k]:
        if judgments.get(result['paper_id'], 0) > 0:
            recallk_count += 1

    positive_judgment_count = 0
    for judgment_value in judgments.values():
        if judgment_value > 0:
            positive_judgment_count += 1

    if positive_judgment_count > 0:
        recallk = recallk_count / positive_judgment_count
        return recallk
    else:
        return 0


def ndcg_at_k(results, judgments, k=5):
    def dcg_at_k(results, judgments, k=5):
        dcg = 0.0

        for rank, result in enumerate(results[:k], start=1):
            relevance = judgments.get(result["paper_id"], 0)
            gain = 2 ** relevance - 1
            discounted_gain = math.log2(rank + 1)
            dcg += gain / discounted_gain

        return dcg

    def idcg_at_k(judgments, k=5):
        ideal_relevances = sorted(
            judgments.values(),
            reverse=True
        )[:k]

        idcg = 0.0

        for rank, relevance in enumerate(ideal_relevances, start=1):
            gain = 2 ** relevance - 1
            discount = math.log2(rank + 1)
            idcg += gain / discount

        return idcg

    dcg = dcg_at_k(results, judgments, k)
    idcg = idcg_at_k(judgments, k)

    if idcg == 0:
        return 0.0

    return dcg / idcg



def rerank_papers(query, candidates, papers_by_id, reranker, top_k=10):
    """Rerank retrieved papers using a cross-encoder."""

    if not candidates:
        return []

    pairs = []
    valid_candidates = []

    for candidate in candidates:
        paper_id = candidate["paper_id"]
        paper = papers_by_id.get(paper_id)

        if paper is None:
            raise ValueError(f"Missing paper metadata: {paper_id}")

        document = f"{paper['title']}\n\n{paper['abstract']}"
        pairs.append((query, document))
        valid_candidates.append(candidate)

    scores = reranker.predict(
        pairs,
        batch_size=8,
        show_progress_bar=False,
    )

    reranked = [
        {
            **candidate,
            "reranker_score": float(score),
        }
        for candidate, score in zip(valid_candidates, scores)
    ]

    return sorted(
        reranked,
        key=lambda item: (-item["reranker_score"], item["paper_id"]),
    )[:top_k]
