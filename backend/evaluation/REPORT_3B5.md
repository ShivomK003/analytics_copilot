# Phase 3B.5 — Offline Retrieval Quality Evaluation

**Status:** Completed — provisional benchmark  
**Evaluation date:** 2026-11-22  
**Decision:** Hybrid RRF remains the default retrieval method.

## 1. Objective

Compare lexical, semantic, hybrid RRF, and BGE-reranked
retrieval for scientific-paper discovery in Analytics Copilot.

Determine whether reranking improves relevance enough to
justify its additional latency.

## 2. Methods

| Method | Endpoint |
|---|---|
| Lexical | `/papers/search?sort=relevance` |
| Semantic | `/papers/semantic-search` |
| Hybrid RRF | `/papers/hybrid-search` |
| BGE reranked | `/papers/reranked-search` |

The reranker uses `BAAI/bge-reranker-v2-m3`.

## 3. Evaluation design

- 12 research queries across AI/ML subdomains.
- Top 10 requested from each retrieval method.
- 230 unique query-paper relevance judgments.
- Frozen rankings stored in `results/snapshot.json`.
- Relevance judgments stored in `results/judgments.csv`.
- Results calculated by `evaluate.py`.

Relevance scale:

- 0: Irrelevant
- 1: Partially relevant
- 2: Highly relevant

Precision@5 treats grades 1 and 2 as relevant.
Missing results count as nonrelevant within the top-five
denominator.

nDCG@10 uses graded gains of 0, 1, and 3.
The ideal ranking is derived from each query's pooled
judged candidate set.

## 4. Overall results

| Method | Mean P@5 | Mean nDCG@10 | Median sampled latency |
|---|---:|---:|---:|
| Lexical | 0.8667 | 0.6922 | 0.573s |
| Semantic | 0.8500 | 0.7286 | 1.773s |
| Hybrid RRF | 0.9333 | 0.8385 | 2.435s |
| BGE reranked | 0.9500 | 0.8674 | 5.457s |

Compared with Hybrid RRF, BGE reranking:

- Improved mean nDCG@10 by 0.0289 absolute.
- Improved mean nDCG@10 by approximately 3.45% relative.
- Improved mean Precision@5 by 0.0167 absolute.
- Increased median sampled latency by approximately 2.24x.

BGE improved nDCG@10 on 7 of 12 queries and
reduced it on 5.

Largest BGE improvements over Hybrid:

- Q04: +0.1828
- Q05: +0.1062
- Q02: +0.0986

Largest regressions:

- Q11: -0.1428
- Q10: -0.1087

## 5. Interpretation

Hybrid RRF substantially improves ranking quality over
the individual lexical and semantic baselines.

BGE reranking improves average ranking quality further,
but its gains are inconsistent and relatively modest
compared with the observed latency increase.

These findings support keeping Hybrid RRF as the default
and retaining BGE as an experimental advanced option.

## 6. Limitations

### Judgment provenance

Q01 contains 13 user-approved relevance judgments.

The remaining 217 judgments were proposed by ChatGPT
using paper titles and abstracts. They have not been
independently human-validated.

Therefore, the results constitute a provisional,
AI-assisted offline benchmark, not an independently
human-labeled retrieval evaluation.

### Query sample

Only 12 selected research queries were evaluated.
The sample is too small to establish general superiority
or statistical significance.

### Candidate pooling

Judgments cover the union of retrieved top-10 results.
They do not establish relevance across the entire corpus.

### arXiv versions

Versioned arXiv IDs were preserved. Different versions
of one logical paper can appear as separate candidates.

### Latency

Each recorded latency is from one sequential API request.
Measurements include possible warm-up and cold-start
effects. They are not controlled production p50/p95
latency benchmarks.

### Corpus consistency

The snapshot freezes returned rankings, not the underlying
database in a transactionally consistent state.

## 7. Reproduction

From the repository root:

    PYTHONPATH=backend uv run python \
      backend/evaluation/evaluate.py

Run evaluation tests:

    PYTHONPATH=backend uv run python -m pytest \
      backend/tests/test_retrieval_evaluation.py -v

Run the full regression suite:

    PYTHONPATH=backend uv run python -m pytest \
      tests/ backend/tests/ -q

The evaluation should produce `results/metrics.json`
from the frozen snapshot and completed judgments.

Do not rerun `collect.py` for this benchmark.

## 8. Decision and future work

1. Keep Hybrid RRF as the default retrieval method.
2. Retain BGE reranking as an experimental option.
3. Independently review a sample of relevance judgments.
4. Expand the benchmark with more diverse research queries.
5. Benchmark warm latency with repeated requests.
6. Investigate reranking regressions on Q10 and Q11.
7. Consider version-collapsed evaluation as a sensitivity test.

No production retrieval changes are required to close
this evaluation phase.
