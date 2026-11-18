import json
import os
from pathlib import Path

import nltk
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from nltk.tokenize import sent_tokenize
from retrieval_utils import (
    flexible_keyword_search,
    keyword_search,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
    reciprocal_rank_fusion,
    semantic_search,
)
from sentence_transformers import SentenceTransformer

DATA_DIR = Path(__file__).resolve().parent

with open(DATA_DIR / "real_samples.json", "r", encoding="utf-8") as file:
    papers = json.load(file)

print(f"Loaded {len(papers)} papers")

with open(DATA_DIR / "multi_query_judgments.json", "r", encoding="utf-8") as file:
    query_data = json.load(file)['queries']

print(f"Loaded {len(query_data)} queries")



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

    paper_ids = [paper['paper_id'] for paper in papers]

    retrieval_evaluation = {}
    for query in query_data:
        keyword_results = keyword_search(conn, query["query"], paper_ids, top_k=10)
        flexible_keyword_results = flexible_keyword_search(conn, query["query"], paper_ids, top_k=10)
        semantic_results = semantic_search(conn, query['query'], paper_ids, model, model_name, top_k=10)
        hybrid_results = reciprocal_rank_fusion(keyword_results, semantic_results)
        flexible_hybrid_results = reciprocal_rank_fusion(
            flexible_keyword_results,
            semantic_results
        )

        print(
            f"{query['id']}: "
            f"Keyword={len(keyword_results)}, "
            f"Flexible={len(flexible_keyword_results)}, "
            f"Semantic={len(semantic_results)}, "
            f"Hybrid={len(hybrid_results)}"
            f"Flexible Hybrid={len(flexible_hybrid_results)}"
        )

        all_results = {
            "keyword_results": keyword_results,
            "flexible_keyword_results": flexible_keyword_results,
            "semantic_results": semantic_results,
            "hybrid_results": hybrid_results,
            "flexible_hybrid_results": flexible_hybrid_results
        }

        for result_type, results in all_results.items():
            precision_at_5 = precision_at_k(results, query['judgments'], k=5)
            recall_at_5 = recall_at_k(results, query['judgments'], k=5)
            ndcg_at_5 = ndcg_at_k(results, query['judgments'], k=5)

            precision_at_10 = precision_at_k(results, query['judgments'], k=10)
            recall_at_10 = recall_at_k(results, query['judgments'], k=10)
            ndcg_at_10 = ndcg_at_k(results, query['judgments'], k=10)

            retrieval_evaluation[(query['id'], result_type)] = {
                "P@5": precision_at_5,
                "R@5": recall_at_5,
                "NDCG@5": ndcg_at_5,
                "P@10": precision_at_10,
                "R@10": recall_at_10,
                "NDCG@10": ndcg_at_10,
            }

    metrics_df = pd.DataFrame.from_dict(retrieval_evaluation, orient="index")
    metrics_df.index = pd.MultiIndex.from_tuples(metrics_df.index, names=["query_id", "result_type"])
    with pd.option_context(
            "display.max_rows", None,
            "display.max_columns", None,
            "display.width", 1000,
            "display.precision", 3,
        ):
            print(metrics_df)

    mean_metrics = metrics_df.groupby(level="result_type").mean()
    print("\nMean metrics across queries:")
    print(mean_metrics.round(3))

        

    

except Exception as exc:
    if conn is not None:
        conn.rollback()

    print(f"\nDatabase error: {exc}")
    raise

finally:
    if conn is not None:
        conn.close()
        print("\nDatabase connection closed")