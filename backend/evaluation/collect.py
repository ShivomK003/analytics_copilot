
"""Collect frozen retrieval results and blind judgment candidates."""

import csv
import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"
BASE_URL = "http://127.0.0.1:8000"

METHODS = {
    "lexical": "/papers/search",
    "semantic": "/papers/semantic-search",
    "hybrid": "/papers/hybrid-search",
    "reranked": "/papers/reranked-search",
}

TOP_K = 10


def fetch(method, query):
    params = {
        "query": query,
        "limit": TOP_K,
    }

    if method == "lexical":
        params["sort"] = "relevance"

    url = BASE_URL + METHODS[method] + "?" + urlencode(params)

    start = time.perf_counter()

    with urlopen(url, timeout=120) as response:
        payload = json.load(response)

    elapsed = time.perf_counter() - start

    if isinstance(payload, list):
        papers = payload
    elif isinstance(payload, dict):
        papers = next(
            (
                payload[key]
                for key in ("papers", "results", "items")
                if isinstance(payload.get(key), list)
            ),
            None,
        )
    else:
        papers = None

    if papers is None:
        raise ValueError(
            f"Unexpected {method} response: {type(payload).__name__}"
        )

    return papers, elapsed


def collect():
    RESULTS.mkdir(parents=True, exist_ok=True)

    snapshot_path = RESULTS / "snapshot.json"
    judgments_path = RESULTS / "judgments.csv"

    if snapshot_path.exists() or judgments_path.exists():
        raise FileExistsError(
            "Evaluation files already exist. Preserve them before "
            "starting a new collection."
        )

    queries = json.loads(
        (ROOT / "queries.json").read_text(encoding="utf-8")
    )

    snapshot = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "top_k": TOP_K,
        "methods": list(METHODS),
        "queries": {},
    }

    judgment_rows = []

    for item in queries:
        qid = item["id"]
        query = item["query"]

        print(f"\n{qid}: {query}", flush=True)

        rankings = {}
        candidate_pool = {}

        for method in METHODS:
            papers, latency = fetch(method, query)

            ids = []

            for paper in papers:
                paper_id = paper["paper_id"]
                ids.append(paper_id)

                candidate_pool.setdefault(
                    paper_id,
                    {
                        "paper_id": paper_id,
                        "title": paper.get("title") or "",
                        "abstract": paper.get("abstract") or "",
                    },
                )

            if len(ids) != len(set(ids)):
                raise ValueError(
                    f"Duplicate paper IDs in {qid}/{method}"
                )

            rankings[method] = {
                "paper_ids": ids,
                "latency_seconds": latency,
            }

            print(
                f"  {method:9s}: {len(ids):2d} papers "
                f"({latency:.2f}s)",
                flush=True,
            )

        snapshot["queries"][qid] = {
            "query": query,
            "rankings": rankings,
        }

        # Shuffle pooled papers to hide their ranking positions.
        candidates = list(candidate_pool.values())
        random.Random(f"2026-{qid}").shuffle(candidates)

        for paper in candidates:
            judgment_rows.append({
                "query_id": qid,
                "query": query,
                "paper_id": paper["paper_id"],
                "title": paper["title"],
                "abstract": paper["abstract"],
                "relevance": "",
            })

        print(f"  Unique candidates: {len(candidates)}")

    # Write both outputs only after successful collection.
    snapshot_path.write_text(
        json.dumps(snapshot, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    with judgments_path.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "query_id",
                "query",
                "paper_id",
                "title",
                "abstract",
                "relevance",
            ],
        )
        writer.writeheader()
        writer.writerows(judgment_rows)

    print("\nCollection complete.")
    print(f"Snapshot: {snapshot_path}")
    print(f"Judgments: {judgments_path}")
    print(f"Total judgments required: {len(judgment_rows)}")


if __name__ == "__main__":
    collect()
