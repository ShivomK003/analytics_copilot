# Analytics Copilot — Development Roadmap

## Project Objective

Build an end-to-end AI research intelligence platform that combines automated data engineering, analytical research exploration, information retrieval and grounded AI research assistance.

Development prioritizes correctness, reproducibility, modularity and measurable improvements over unnecessary architectural complexity.

## Status Legend

- [x] Implemented
- [ ] Planned or outstanding

## Current Milestone

**Phase 3C.1 — Evidence Assembly and Context Construction: Complete**

**Next milestone: Phase 3C.2 — Grounded LLM Synthesis**

Last updated: 25 November 2026.

## Phase 1 — Data Engineering Foundations

**Status: Complete**

### Data Ingestion

- [x] arXiv API integration.
- [x] Research category configuration.
- [x] Incremental publication extraction.
- [x] Historical backfilling.
- [x] Pagination.
- [x] Publication deduplication.

### Data Processing

- [x] Publication transformation and cleaning.
- [x] Required-field validation.
- [x] Warehouse record generation.
- [x] Author, category and topic relationships.

### Data Warehouse

- [x] PostgreSQL warehouse hosted on Supabase.
- [x] Publication fact table.
- [x] Author, category and topic dimensions.
- [x] Many-to-many relationship tables.
- [x] Transactional loading.

### Pipeline Reliability

- [x] HTTP retry handling.
- [x] Exponential backoff.
- [x] Rate-limit handling.
- [x] Request pacing.
- [x] Incomplete extraction failure handling.
- [x] Database rollback handling.
- [x] Pipeline execution metadata.
- [x] GitHub Actions scheduling.
- [x] ETL documentation.

## Phase 2 — Research Intelligence Platform

**Status: Implemented**

### Backend Foundations

- [x] FastAPI backend.
- [x] Database access layer.
- [x] Connection pooling.
- [x] Parameterized analytical queries.
- [x] API validation and error handling.

### Research Analytics

- [x] Publication trends.
- [x] Topic analysis.
- [x] Category analysis.
- [x] Author exploration.
- [x] Research momentum.
- [x] Topic associations.
- [x] Category composition and prevalence.
- [x] Analytical evidence retrieval.
- [x] Context-aware filtering and pagination.

### Frontend

- [x] React dashboard.
- [x] Interactive analytical visualizations.
- [x] Publication explorer.
- [x] Contextual evidence drawer.
- [x] Evidence-preserving navigation.
- [x] Shared frontend design system.

### Outstanding Verification

- [ ] Complete any remaining desktop and mobile visual verification of evidence exploration.
- [ ] Address previously identified frontend lint and bundle-size concerns where still applicable.

## Phase 3 — AI Research Assistant

**Status: In progress**

The research assistant extends the existing research intelligence platform with semantic retrieval, evidence selection and grounded answer generation.

## Phase 3A — Semantic Retrieval Foundations

**Status: Complete**

- [x] Embedding model integration.
- [x] Publication text chunking.
- [x] Overlapping chunks.
- [x] Normalized embeddings.
- [x] pgvector storage.
- [x] Versioned embedding index identifiers.
- [x] HNSW indexing.
- [x] Semantic publication retrieval.
- [x] Exact retrieval fallback.
- [x] Semantic search API.
- [x] Embedding coverage verification.

### Current Embedding Configuration

| Parameter | Value |
|---|---|
| Model | all-MiniLM-L6-v2 |
| Dimensions | 384 |
| Chunk size | 200 tokens |
| Chunk overlap | 30 tokens |
| Normalization | L2 |
| Similarity | Cosine |
| ANN index | HNSW |

### Historical Coverage Verification

A coverage check performed during Phase 3C.1 found:

- 30,947 publications.
- 30,947 publications with at least one non-null embedding.
- 100% publication-level embedding coverage.
- 62,547 non-null embedding chunks.
- All inspected embedding norms within the configured unit-norm tolerance.

These figures describe a historical database snapshot. They do not guarantee current coverage or completeness of every expected publication chunk.

## Phase 3B — Hybrid Retrieval and Evaluation

**Status: Complete**

- [x] PostgreSQL lexical retrieval.
- [x] Semantic retrieval integration.
- [x] Reciprocal Rank Fusion.
- [x] Hybrid publication ranking.
- [x] Experimental cross-encoder reranking.
- [x] Retrieval evaluation dataset.
- [x] Relevance judgment collection.
- [x] Ranking quality metrics.
- [x] Latency measurement.
- [x] Default retrieval strategy selection.

### Phase 3B.5 — Retrieval Quality Evaluation

The initial retrieval evaluation compared four retrieval strategies across 12 research queries.

The evaluation contained 230 unique query-publication relevance judgments.

Of these:

- 13 judgments were human-approved.
- 217 judgments were provisional model-generated labels.

### Selected Evaluation Results

| Method | Precision@5 | nDCG@10 | Median Sampled Latency |
|---|---:|---:|---:|
| Hybrid RRF | 0.9333 | 0.8385 | 2.435 s |
| Hybrid with reranking | 0.9500 | 0.8674 | 5.457 s |

### Decision

Hybrid RRF remains the default retrieval strategy.

Cross-encoder reranking remains available experimentally because its measured quality improvement did not clearly justify its additional latency for the initial use case.

### Limitations

The evaluation is preliminary because most relevance judgments have not been independently human-validated.

Further evaluation is required before making strong claims about retrieval quality.

## Phase 3C — Research Agent Foundations

**Status: In progress**

### Phase 3C.1 — Evidence Assembly and Context Construction

**Status: Complete**

#### Evidence Retrieval

- [x] Retrieve hybrid search candidates.
- [x] Retrieve the exact best matching chunk per candidate.
- [x] Preserve original hybrid retrieval order.
- [x] Convert stored embeddings into NumPy arrays.
- [x] Preserve matching chunk metadata.

#### Evidence Selection

- [x] Implement cosine redundancy calculation.
- [x] Implement MMR scoring.
- [x] Implement deterministic greedy MMR selection.
- [x] Validate relevance weight.
- [x] Preserve candidate immutability.
- [x] Conduct initial relevance-diversity sensitivity analysis.

#### Evidence Assembly

- [x] Merge selected chunks with publication metadata.
- [x] Preserve retrieval and selection ranks.
- [x] Remove raw embedding vectors.
- [x] Separate selected evidence and remaining candidates.
- [x] Handle empty and partially available evidence.

#### Context Construction

- [x] Implement model-independent token-counting interface.
- [x] Format complete original abstracts.
- [x] Implement caller-supplied context budgets.
- [x] Count combined formatted context.
- [x] Skip oversized evidence without truncation.
- [x] Assign contiguous source identifiers.
- [x] Preserve overflow publications.
- [x] Construct explicit source registry.

#### Recommendations

- [x] Prioritize overflow evidence.
- [x] Include remaining hybrid candidates.
- [x] Apply configurable recommendation limits.
- [x] Keep recommendations outside generation context.

#### Testing and Integration

- [x] Evidence selection unit tests.
- [x] Evidence retrieval unit tests.
- [x] Evidence assembly unit tests.
- [x] Context construction unit tests.
- [x] Live Supabase integration.
- [x] Corpus abstract-length analysis.
- [x] Repository-wide pytest configuration.
- [x] Full Python regression suite.

### Phase 3C.1 Validation

| Test Area | Passed |
|---|---:|
| Evidence selection | 16 |
| Evidence retrieval | 8 |
| Evidence assembly | 34 |
| Evidence budget and context | 68 |
| Total new tests | 126 |

Full Python regression results:

```text
278 passed
28 skipped
94 subtests passed
Execution time: 9.66 seconds
```

### Live Integration

Research question:

> What are the limitations of diffusion policies in robotic manipulation?

Results:

| Metric | Result |
|---|---:|
| Selected evidence | 5 |
| Included evidence | 5 |
| Overflow | 0 |
| Recommendations | 5 |
| Formatted context words | 932 |
| Temporary word budget | 2,000 |
| Unused word budget | 1,068 |

All integration invariants passed:

- Source registry matched included evidence.
- Recommendations did not overlap with included evidence.
- Context remained within the supplied budget.
- Recorded context consumption matched the counting function.

The temporary counting function measured whitespace-delimited words, not actual LLM tokens.

### Corpus Abstract-Length Analysis

Database snapshot measured on 25 November 2026:

| Metric | Value |
|---|---:|
| Abstracts | 32,156 |
| Minimum words | 17 |
| Mean words | 194.38 |
| Median words | 194 |
| P90 | 250 |
| P95 | 266 |
| P99 | 297 |
| Maximum words | 371 |

The observed abstract lengths support the decision to retain complete abstracts for initial evidence construction.

Model-specific token benchmarking is deferred until generation model selection.

### Phase 3C.1 Architectural Decisions

- Hybrid RRF is the default retrieval strategy.
- The initial candidate limit is 20.
- The initial evidence limit is five.
- The initial MMR relevance weight is 0.7.
- Evidence selection operates on query-conditioned chunk embeddings.
- Generation context uses complete original abstracts.
- Context budgets are supplied by the caller.
- Recommendations do not consume generation tokens.
- Source registries preserve explicit publication identity and provenance.
- Duplicate query embedding computation is deferred as an optimization.

The current selection parameters remain provisional pending downstream answer-quality evaluation.

## Phase 3C.2 — Grounded LLM Synthesis

**Status: Next milestone**

### Objective

Transform prepared research evidence into coherent, grounded answers using a generation model.

### Model Selection

- [ ] Define generation requirements.
- [ ] Compare local and hosted generation models.
- [ ] Evaluate expected generation quality.
- [ ] Evaluate structured output support.
- [ ] Evaluate inference latency.
- [ ] Evaluate deployment requirements and cost.
- [ ] Select an initial generation model.

### Model Integration

- [ ] Define the generation service interface.
- [ ] Configure model and provider credentials where required.
- [ ] Implement generation requests.
- [ ] Implement timeout and failure handling.
- [ ] Keep provider-specific implementation details isolated.

### Context Management

- [ ] Implement model-specific token counting.
- [ ] Determine available evidence context capacity.
- [ ] Account for system instructions and output allowance.
- [ ] Integrate token counting with evidence construction.
- [ ] Benchmark actual context consumption.

### Prompt Construction

- [ ] Define research assistant instructions.
- [ ] Define evidence-grounding requirements.
- [ ] Define citation conventions.
- [ ] Distinguish evidence-supported claims from uncertainty.
- [ ] Prevent instructions embedded in retrieved documents from overriding application instructions.
- [ ] Define behavior for insufficient evidence.

### Answer Generation

- [ ] Define the initial answer response schema.
- [ ] Implement grounded answer generation.
- [ ] Integrate source identifiers.
- [ ] Preserve source registry and recommendations.
- [ ] Implement a basic single-turn research workflow.

### Validation

- [ ] Mocked generation service tests.
- [ ] Prompt construction tests.
- [ ] Structured response tests.
- [ ] Failure handling tests.
- [ ] Live generation integration.
- [ ] Initial latency and cost measurements.

### Completion Criteria

The system can accept a research question, retrieve evidence, construct model-compatible context and generate an answer that references the supplied evidence.

Robust semantic citation validation and broader hallucination safeguards will be developed in Phase 3C.3.

## Phase 3C.3 — Citation Validation and Hallucination Safeguards

**Status: Planned**

### Objective

Improve the reliability of generated research answers.

### Citation Integrity

- [ ] Validate cited source identifiers.
- [ ] Reject references to unavailable sources.
- [ ] Resolve citations through the source registry.
- [ ] Detect missing or malformed citations.

### Semantic Grounding

- [ ] Define claim-level evidence support requirements.
- [ ] Evaluate whether cited abstracts support generated claims.
- [ ] Detect unsupported factual statements.
- [ ] Handle contradictory evidence.
- [ ] Evaluate citation completeness.

### Answerability

- [ ] Evaluate insufficient-evidence detection.
- [ ] Handle out-of-domain questions.
- [ ] Distinguish retrieval success from question answerability.
- [ ] Implement appropriate abstention behavior.

### Robustness

- [ ] Evaluate retrieved-content prompt injection.
- [ ] Evaluate misleading or irrelevant evidence.
- [ ] Evaluate malformed model responses.
- [ ] Define bounded recovery behavior.

## Phase 3C.4 — Multi-Turn Research Conversations

**Status: Planned**

### Objective

Support coherent follow-up research questions without losing evidence provenance.

- [ ] Define conversation state.
- [ ] Define conversation persistence requirements.
- [ ] Interpret context-dependent follow-up questions.
- [ ] Evaluate standalone query rewriting.
- [ ] Retrieve additional evidence when required.
- [ ] Manage conversation history within context limits.
- [ ] Preserve citation identity across turns.
- [ ] Prevent unsupported claims from accumulating across conversation history.
- [ ] Implement conversation-level testing.

## Phase 3C.5 — Agent Evaluation and Frontend Integration

**Status: Planned**

### Research Assistant Evaluation

- [ ] Expand the research question evaluation dataset.
- [ ] Increase human-reviewed relevance judgments.
- [ ] Evaluate answer correctness.
- [ ] Evaluate evidence relevance.
- [ ] Evaluate citation precision and completeness.
- [ ] Evaluate abstention behavior.
- [ ] Compare MMR against simpler evidence selection baselines.
- [ ] Evaluate alternative evidence limits.
- [ ] Measure end-to-end latency.
- [ ] Measure token consumption and generation cost.

### Backend Integration

- [ ] Define research assistant API contracts.
- [ ] Expose research question submission.
- [ ] Expose generated answers and citations.
- [ ] Expose further-reading recommendations.
- [ ] Implement appropriate error responses.
- [ ] Evaluate streaming requirements.

### Frontend Integration

- [ ] Research assistant interface.
- [ ] Research question input.
- [ ] Generated answer rendering.
- [ ] Interactive citation links.
- [ ] Evidence inspection.
- [ ] Further-reading recommendations.
- [ ] Loading and error states.
- [ ] Multi-turn conversation interface.
- [ ] Accessibility and responsive design.
- [ ] Frontend integration tests.

## Future Enhancements — Unscheduled

The following are potential improvements rather than committed implementation milestones.

### Retrieval

- [ ] Reuse query embeddings across retrieval stages.
- [ ] Evaluate alternative embedding models.
- [ ] Evaluate improved chunking strategies.
- [ ] Store exact source text offsets.
- [ ] Expand human relevance annotations.
- [ ] Evaluate adaptive retrieval and evidence limits.

### Research Corpus

- [ ] Evaluate full-text publication ingestion.
- [ ] Evaluate section-aware document parsing.
- [ ] Evaluate publication citation relationships.
- [ ] Evaluate additional research data sources.

### Research Assistant

- [ ] Evaluate analytical tool integration.
- [ ] Support questions requiring structured warehouse queries.
- [ ] Evaluate combined analytical and literature-based research answers.
- [ ] Evaluate multi-step research workflows.
- [ ] Evaluate automated research summaries.

### Operations

- [ ] Generation observability.
- [ ] End-to-end performance monitoring.
- [ ] Model usage and cost tracking.
- [ ] Deployment optimization.
- [ ] Production security review.

## Development Principles

1. Establish correctness before optimization.
2. Evaluate improvements against meaningful baselines.
3. Avoid introducing dependencies without demonstrated value.
4. Preserve publication identity and evidence provenance.
5. Keep retrieval, evidence construction and generation independently testable.
6. Prefer deterministic processing where generative reasoning is unnecessary.
7. Distinguish measured results from assumptions and estimates.
8. Document architectural decisions and their limitations.
9. Avoid treating preliminary evaluation results as definitive conclusions.
10. Build incrementally and validate each milestone before introducing additional complexity.

## Current Priorities

1. Complete Phase 3C.1 documentation and commit.
2. Select an initial generation model.
3. Implement model-specific context management.
4. Implement grounded single-turn answer generation.
5. Validate citation correctness and answerability.
6. Introduce multi-turn research conversations.
7. Evaluate and integrate the research assistant into the frontend.

For the technical design of the current system, see [ARCHITECTURE.md](ARCHITECTURE.md).