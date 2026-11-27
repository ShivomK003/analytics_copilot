
"""Evaluate frozen retrieval rankings against human judgments."""

import csv
import json
import math
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"

SNAPSHOT_PATH = RESULTS / "snapshot.json"
JUDGMENTS_PATH = RESULTS / "judgments.csv"
METRICS_PATH = RESULTS / "metrics.json"


def precision_at_k(paper_ids, grades, k=5):
    """Grades 1 and 2 count as relevant."""
    relevant = sum(
        grades[paper_id] >= 1
        for paper_id in paper_ids[:k]
    )
    return relevant / k


def ndcg_at_k(paper_ids, grades, k=10):
    """Graded nDCG using gains of 0, 1, and 3."""

    def dcg(values):
        return sum(
            (2 ** grade - 1) / math.log2(rank + 1)
            for rank, grade in enumerate(values, start=1)
        )

    actual = [
        grades[paper_id]
        for paper_id in paper_ids[:k]
    ]

    ideal = sorted(
        grades.values(),
        reverse=True,
    )[:k]

    ideal_dcg = dcg(ideal)

    if ideal_dcg == 0:
        return 0.0

    return dcg(actual) / ideal_dcg


def load_judgments(snapshot):
    """Validate and load complete relevance judgments."""

    expected = {
        (qid, paper_id)
        for qid, query_data in snapshot["queries"].items()
        for ranking in query_data["rankings"].values()
        for paper_id in ranking["paper_ids"]
    }

    grades = {}
    incomplete = []

    with JUDGMENTS_PATH.open(
        newline="", encoding="utf-8"
    ) as file:
        for row in csv.DictReader(file):
            key = (row["query_id"], row["paper_id"])

            if key not in expected:
                raise ValueError(
                    f"Unexpected judgment: {key}"
                )

            if key in grades or key in incomplete:
                raise ValueError(
                    f"Duplicate judgment: {key}"
                )

            value = row["relevance"].strip()

            if not value:
                incomplete.append(key)
                continue

            if value not in {"0", "1", "2"}:
                raise ValueError(
                    f"Invalid relevance grade for {key}: {value}"
                )

            grades[key] = int(value)

    missing = expected - set(grades)

    if missing:
        examples = sorted(missing)[:5]
        raise ValueError(
            f"{len(missing)} judgments are missing. "
            f"Examples: {examples}"
        )

    return grades


def evaluate():
    snapshot = json.loads(
        SNAPSHOT_PATH.read_text(encoding="utf-8")
    )

    judgments = load_judgments(snapshot)

    per_query = {}
    summary = {}

    for qid, query_data in snapshot["queries"].items():
        query_grades = {
            paper_id: grade
            for (judgment_qid, paper_id), grade
            in judgments.items()
            if judgment_qid == qid
        }

        per_query[qid] = {}

        for method, ranking in query_data["rankings"].items():
            ids = ranking["paper_ids"]

            per_query[qid][method] = {
                "precision_at_5": precision_at_k(
                    ids, query_grades
                ),
                "ndcg_at_10": ndcg_at_k(
                    ids, query_grades
                ),
                "latency_seconds": ranking[
                    "latency_seconds"
                ],
                "returned_count": len(ids),
            }

    for method in snapshot["methods"]:
        rows = [
            per_query[qid][method]
            for qid in snapshot["queries"]
        ]

        summary[method] = {
            "mean_precision_at_5": statistics.mean(
                row["precision_at_5"] for row in rows
            ),
            "mean_ndcg_at_10": statistics.mean(
                row["ndcg_at_10"] for row in rows
            ),
            "median_sampled_latency_seconds": (
                statistics.median(
                    row["latency_seconds"] for row in rows
                )
            ),
            "mean_returned_count": statistics.mean(
                row["returned_count"] for row in rows
            ),
        }

    output = {
        "snapshot_created_at": snapshot["created_at"],
        "query_count": len(snapshot["queries"]),
        "judgment_count": len(judgments),
        "precision_relevance_threshold": 1,
        "summary": summary,
        "per_query": per_query,
    }

    METRICS_PATH.write_text(
        json.dumps(output, indent=2),
        encoding="utf-8",
    )

    print("\nRetrieval evaluation")
    print(
        f"{'Method':<12} {'P@5':>8} "
        f"{'nDCG@10':>10} {'Median latency':>16}"
    )

    for method, metrics in summary.items():
        print(
            f"{method:<12} "
            f"{metrics['mean_precision_at_5']:>8.3f} "
            f"{metrics['mean_ndcg_at_10']:>10.3f} "
            f"{metrics['median_sampled_latency_seconds']:>15.2f}s"
        )

    print(f"\nSaved: {METRICS_PATH}")


if __name__ == "__main__":
    evaluate()
