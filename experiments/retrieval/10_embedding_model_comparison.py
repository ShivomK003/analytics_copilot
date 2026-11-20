
import gc
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

from retrieval_utils import ndcg_at_k, precision_at_k, recall_at_k


DATA_DIR = Path(__file__).resolve().parent

MODELS = {
    "MiniLM": "sentence-transformers/all-MiniLM-L6-v2",
    "Qwen3-0.6B": "Qwen/Qwen3-Embedding-0.6B",
}


with open(DATA_DIR / "real_samples.json", encoding="utf-8") as f:
    papers = json.load(f)

with open(DATA_DIR / "multi_query_judgments.json", encoding="utf-8") as f:
    queries = json.load(f)["queries"]

paper_ids = [paper["paper_id"] for paper in papers]
documents = [
    f"{paper['title']}\n\n{paper['abstract']}"
    for paper in papers
]

query_texts = [query["query"] for query in queries]

assert len(paper_ids) == len(set(paper_ids))
assert all(set(q["judgments"]) == set(paper_ids) for q in queries)

metrics = []
performance = []

for label, model_name in MODELS.items():
    print(f"\n{'=' * 60}")
    print(f"Evaluating {label}")
    print(f"{'=' * 60}")

    start = time.perf_counter()
    model = SentenceTransformer(model_name)
    load_seconds = time.perf_counter() - start

    tokenizer = model.tokenizer
    max_tokens = model.max_seq_length

    token_lengths = [
        len(tokenizer.encode(doc, add_special_tokens=True))
        for doc in documents
    ]

    truncated = sum(length > max_tokens for length in token_lengths)

    print(f"Embedding dimensions: {model.get_sentence_embedding_dimension()}")
    print(f"Maximum sequence length: {max_tokens}")
    print(f"Documents exceeding limit: {truncated}/{len(documents)}")

    batch_size = 2 if label == "Qwen3-0.6B" else 16

    start = time.perf_counter()
    document_embeddings = model.encode_document(
        documents,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=True,
    )
    document_seconds = time.perf_counter() - start

    start = time.perf_counter()
    query_embeddings = model.encode_query(
        query_texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    query_seconds = time.perf_counter() - start

    similarities = np.asarray(query_embeddings) @ np.asarray(document_embeddings).T

    for query_index, query in enumerate(queries):
        ranking = np.argsort(-similarities[query_index], kind="stable")

        results = [
            {
                "paper_id": paper_ids[i],
                "score": float(similarities[query_index, i]),
            }
            for i in ranking
        ]

        judgments = query["judgments"]

        metrics.append({
            "model": label,
            "query_id": query["id"],
            "P@10": precision_at_k(results, judgments, k=10),
            "R@10": recall_at_k(results, judgments, k=10),
            "NDCG@10": ndcg_at_k(results, judgments, k=10),
        })

    performance.append({
        "model": label,
        "load_seconds": load_seconds,
        "document_seconds": document_seconds,
        "query_seconds": query_seconds,
        "truncated_documents": truncated,
        "dimensions": model.get_sentence_embedding_dimension(),
    })

    del model, document_embeddings, query_embeddings
    gc.collect()


metrics_df = pd.DataFrame(metrics)
performance_df = pd.DataFrame(performance).set_index("model")

print("\nPER-QUERY RESULTS")
print(metrics_df.round(3).to_string(index=False))

print("\nMEAN RETRIEVAL METRICS")
print(
    metrics_df.groupby("model")[["P@10", "R@10", "NDCG@10"]]
    .mean()
    .round(3)
    .to_string()
)

print("\nMODEL PERFORMANCE")
print(performance_df.round(2).to_string())
