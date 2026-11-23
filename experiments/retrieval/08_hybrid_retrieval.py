import json
import os
from pathlib import Path

import nltk
import psycopg2
from dotenv import load_dotenv
from nltk.tokenize import sent_tokenize
from retrieval_utils import (
    keyword_search,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
    reciprocal_rank_fusion,
    semantic_search,
)
from sentence_transformers import SentenceTransformer

nltk.download('punkt_tab')

def fetch_sample_papers():
    with open("experiments/retrieval/real_samples.json", "r", encoding="utf-8") as file:
        data = json.load(file)

    return data

def fetch_relevance_data():
    with open("experiments/retrieval/relevance_judgments.json", "r", encoding="utf-8") as file:
        data = json.load(file)
    return data


def chunk_paper(paper, tokenizer, max_tokens=256):
    title = paper["title"]
    sentences = sent_tokenize(paper["abstract"])

    chunks = []
    current_sentences = []

    def make_chunk(sentences):
        return f"{title}\n{" ".join(sentences)}"

    def fits(sentences):
        return (
            len(tokenizer(
                    make_chunk(sentences),
                    add_special_tokens=True,
                    truncation=False
                )['input_ids']
            ) <= max_tokens
        )

    for sentence in sentences:
        if fits(current_sentences + [sentence]): 
            current_sentences.append(sentence)
        else:
            if not current_sentences:
                raise ValueError(f"{sentence} is the first sentence and does not fit the sequence limit.\n(Paper {paper['paper_id']})")
            chunk = make_chunk(current_sentences)
            chunks.append(chunk)

            overlap_sentence = current_sentences[-1]

            if fits([overlap_sentence, sentence]): 
                current_sentences = [overlap_sentence, sentence]
            else:
                if fits([sentence]):
                    current_sentences = [sentence]
                else:
                    raise ValueError(f"{sentence} does not fit the sequence limit.\n(Paper {paper['paper_id']})")
                                
    if current_sentences:
        chunk = make_chunk(current_sentences)
        chunks.append(chunk)

    return chunks 

def prepare_chunk_records(papers, tokenizer, max_tokens=256):
    chunk_records = []
    
    for paper in papers:
        chunks = chunk_paper(paper, tokenizer, max_tokens)
        
        for chunk_idx, chunk in enumerate(chunks): 
            chunk_records.append({
                "paper_id": paper['paper_id'],
                "chunk_index": chunk_idx,
                "chunk_text": chunk
            })

    return chunk_records


def store_chunk_embeddings(
    conn,
    chunk_records,
    embeddings,
    model_name
):
    insert_sql = """
        INSERT INTO public.paper_embedding_chunks (
            paper_id,
            chunk_index,
            chunk_text,
            embedding,
            model_name
        )
        VALUES (%s, %s, %s, %s::extensions.vector, %s)
        ON CONFLICT (paper_id, chunk_index, model_name)
        DO UPDATE SET
            chunk_text = EXCLUDED.chunk_text,
            embedding = EXCLUDED.embedding;
    """

    with conn.cursor() as cursor:
        if len(chunk_records) != len(embeddings):
            raise ValueError("Chunk records and embeddings count mismatch")
        
        for record, embedding in zip(chunk_records, embeddings):
            vector_string = "[" + ",".join(map(str, embedding)) + "]"

            cursor.execute(
                insert_sql,
                (
                    record['paper_id'],
                    record['chunk_index'],
                    record['chunk_text'],
                    vector_string,
                    model_name
                )
            )

        print(f"Successfully inserted/updated {len(chunk_records)} embeddings (Paper {record['paper_id']})")

    conn.commit()
    print("\nTransaction committed successfully")
        
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / "backend" / ".env"

load_dotenv(ENV_PATH)

DB_CONFIG = {
    "host": os.environ["SUPABASE_HOST"],
    "port": os.environ["SUPABASE_PORT"],
    "dbname": os.environ["SUPABASE_DB"],
    "user": os.environ["SUPABASE_USER"],
    "password": os.environ["SUPABASE_PASSWORD"],
    "sslmode": os.getenv("SUPABASE_SSLMODE", "require"),
    "connect_timeout": 15,
}

model_name = "sentence-transformers/all-MiniLM-L6-v2"
model = SentenceTransformer(model_name)
tokenizer = model.tokenizer


conn = None

try:
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False

    print("\nConnected to Supabase PostgreSQL")

    with conn.cursor() as cursor:
        cursor.execute("SELECT current_user;")
        print("Database role:", cursor.fetchone()[0])

    sample_papers = fetch_sample_papers()
    print("Papers Fetched: ", len(sample_papers))

    chunk_records = prepare_chunk_records(sample_papers, tokenizer, model.max_seq_length)
    print("Number of Records: ", len(chunk_records))
    text = [record['chunk_text'] for record in chunk_records]

    doc_embeddings = model.encode_document(text, normalize_embeddings=True)

    assert len(doc_embeddings) == len(chunk_records)
    assert doc_embeddings.shape[1] == 384
    assert len({record["paper_id"] for record in chunk_records}) == len(sample_papers)

    store_chunk_embeddings(
        conn,
        chunk_records,
        doc_embeddings,
        model_name
    )

    paper_ids = [paper['paper_id'] for paper in sample_papers]
    query = "reinforcement learning"

    print(" =============== Keyword Search Retrieval ==================")
    keyword_results = keyword_search(conn, query, paper_ids, top_k=10)

    print(f"Search results for query '{query}'")
    print("--------------------------------------------")
    for result in keyword_results:
        print(
            f"Paper ID: {result['paper_id']} "
            f"| Score: {result['score']}"
        )

    print(" =============== Semantic Search Retrieval ==================")
    semantic_results = semantic_search(conn, query, paper_ids, model, model_name, top_k=10)
    
    print(f"Search results for query '{query}'")
    print("--------------------------------------------")
    for result in semantic_results:
        print(
            f"Paper ID: {result['paper_id']} "
            f"| Similarity Score: {result['score']}"
        )

    hybrid_results = reciprocal_rank_fusion(
    keyword_results,
    semantic_results
)

    print("=============== Hybrid Retrieval (RRF) ===============")
    print(f"Search results for query '{query}'")
    print("--------------------------------------------")
    for rank, result in enumerate(hybrid_results, start=1):
        print(
            f"Rank {rank} | "
            f"Paper ID: {result['paper_id']} | "
            f"RRF Score: {result['rrf_score']:.6f}"
        )

    print("--------------------------------------------")

    judgments = fetch_relevance_data()['judgments']

    methods_scores = [{
        "method": "Keyword",
        "results": keyword_results,
        "P@5": precision_at_k(keyword_results, judgments),
        "R@5": recall_at_k(keyword_results, judgments),
        "NDCG@5": ndcg_at_k(keyword_results, judgments, k=5),
        "P@10": precision_at_k(keyword_results, judgments, k=10),
        "R@10": recall_at_k(keyword_results, judgments, k=10),
        "NDCG@10": ndcg_at_k(keyword_results, judgments, k=10),        
    }, {
        "method": "Semantic",
        "results": semantic_results,
        "P@5": precision_at_k(semantic_results, judgments),
        "R@5": recall_at_k(semantic_results, judgments),
        "NDCG@5": ndcg_at_k(semantic_results, judgments, k=5),
        "P@10": precision_at_k(semantic_results, judgments, k=10),
        "R@10": recall_at_k(semantic_results, judgments, k=10),
        "NDCG@10": ndcg_at_k(semantic_results, judgments, k=10), 
    }, {
        "method": "Hybrid",
        "results": hybrid_results,
        "P@5": precision_at_k(hybrid_results, judgments),
        "R@5": recall_at_k(hybrid_results, judgments),
        "NDCG@5": ndcg_at_k(hybrid_results, judgments, k=5),
        "P@10": precision_at_k(hybrid_results, judgments, k=10),
        "R@10": recall_at_k(hybrid_results, judgments, k=10),
        "NDCG@10": ndcg_at_k(hybrid_results, judgments, k=10), 
    }]

    for method_scores in methods_scores:
        print(
            f"Method: {method_scores['method']}\n"
            "============================================\n"
            "For k=5: "
            f"Precision@5: {method_scores["P@5"]}"
            f" | Recall@5: {method_scores["R@5"]}" 
            f" | NDCG@5: {method_scores["NDCG@5"]}\n"
            "\n--------------------------------------------\n"
            "For k=10: "
            f"Precision@10: {method_scores["P@10"]}"
            f" | Recall@10: {method_scores["R@10"]}" 
            f" | NDCG@10: {method_scores["NDCG@10"]}\n" 
            "\n============================================"           
        )
 
    
    

except Exception as exc:
    if conn is not None:
        conn.rollback()

    print(f"\nDatabase error: {exc}")
    raise

finally:
    if conn is not None:
        conn.close()
        print("\nDatabase connection closed")


