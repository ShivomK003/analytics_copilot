# Research Intelligence API — Phases 1A–1C

Phase 1A adds read-only corpus coverage and research topic options. Existing
paper, author, dashboard, trend, topic and category APIs remain unchanged.
Phase 1B adds weekly momentum and comparable-window momentum matrix datasets.
Phase 1C adds topic relationships and topic–category heatmap datasets.
Research Composition and evidence-filter enhancements remain unimplemented.

## Response conventions

All intelligence endpoints return `{ "meta": {...}, "data": ... }` using Pydantic response
models. Dates serialize as ISO `YYYY-MM-DD`; timestamps include a UTC offset
(or `Z`). Metadata contains:

| Field | Meaning |
|---|---|
| `date_from`, `date_to` | Requested inclusive dates; null means unbounded. Coverage has no date parameters, so both are null. |
| `timezone` | Always `UTC`. |
| `observed_date_from`, `observed_date_to` | Earliest/latest observed publication dates in the **whole indexed corpus**, independent of the selected topic-count interval. Null if no dated papers exist. |
| `coverage_status` | Always `unknown` in Phases 1A–1C. No auditable completeness source is currently implemented. |
| `warnings` | Human-readable caveats about unverified history, automatic topic labels, undated publications, and unavailable ETL freshness where applicable. |

Observed bounds do not prove continuous or complete ingestion between them.
`unknown` means completeness has not been verified; it does not assert a gap.
A successful ETL run indicates execution freshness, not historical completeness.

## GET /intelligence/coverage

No query parameters. Counts describe the entire stored corpus, including undated
papers. Example request:

```text
GET /intelligence/coverage
```

Illustrative response (values are not hardcoded in the API):

```json
{
  "meta": {
    "date_from": null,
    "date_to": null,
    "timezone": "UTC",
    "observed_date_from": "2026-06-17",
    "observed_date_to": "2026-10-08",
    "coverage_status": "unknown",
    "warnings": [
      "Historical ingestion completeness has not been verified.",
      "Topic assignments are automatically detected and may contain classification noise."
    ]
  },
  "data": {
    "total_indexed_papers": 14147,
    "dated_papers": 14147,
    "undated_papers": 0,
    "tagged_papers": 11210,
    "untagged_papers": 2937,
    "total_topics": 8,
    "observed_date_from": "2026-06-17",
    "observed_date_to": "2026-10-08",
    "latest_successful_etl_at": "2026-10-13T02:36:23.123166Z"
  }
}
```

`fact_papers.paper_id` is the primary key, so each fact row counts once.
`EXISTS` identifies tagged papers without multiplying rows through overlapping
topic assignments. Untagged papers are the complement of tagged papers.
Pydantic validation enforces:

- `dated_papers + undated_papers == total_indexed_papers`
- `tagged_papers + untagged_papers == total_indexed_papers`

`total_topics` counts configured rows in `dim_topic`, including zero-paper topics.
An empty corpus returns zero paper counts and null observed dates, while retaining
the configured topic count.

### ETL freshness

The service inspects `pg_attribute` for the `etl_runs` relation resolved through
the existing database search path. It requires a text-compatible `status` column
and a `timestamp with time zone` `end_time` column. Freshness is the maximum
non-null `end_time` of a run with exact status `SUCCESS`, normalized to UTC.
It never substitutes a start timestamp for a missing completion timestamp.

If the table/required columns are absent or their types are unsupported,
`latest_successful_etl_at` is null and metadata includes a warning. No completed
successful run also produces null and a specific warning. Other database errors,
including permissions or connectivity failures, return HTTP 500; they are not
silently converted to successful coverage responses.

Coverage counts and bounds are computed in one statement. Optional ETL schema
inspection and freshness retrieval are separate queries and may reflect a newer
execution than the corpus-count snapshot.

## GET /intelligence/topics

| Parameter | Type | Default |
|---|---|---|
| `date_from` | Optional strict ISO calendar date | Unbounded lower side |
| `date_to` | Optional strict ISO calendar date | Unbounded upper side |

Examples:

```text
GET /intelligence/topics
GET /intelligence/topics?date_from=2026-07-01&date_to=2026-07-31
GET /intelligence/topics?date_to=2026-07-31
```

Illustrative response structure:

```json
{
  "meta": {
    "date_from": "2026-07-01",
    "date_to": "2026-07-31",
    "timezone": "UTC",
    "observed_date_from": "2026-06-17",
    "observed_date_to": "2026-10-08",
    "coverage_status": "unknown",
    "warnings": [
      "Historical ingestion completeness has not been verified.",
      "Topic assignments are automatically detected and may contain classification noise."
    ]
  },
  "data": [
    {
      "topic_id": 5,
      "topic_name": "agents",
      "period_paper_count": 100,
      "total_indexed_paper_count": 2466
    }
  ]
}
```

The example period count is illustrative. The actual API returns all configured
topics, sorted by `topic_name` then `topic_id`, including topics with no papers or
no papers in the interval. No artificial “Unclassified” topic is introduced.

- `period_paper_count`: distinct stored paper IDs for the topic with a non-null
  publication timestamp in the requested interval. Undated papers are excluded
  even when both boundaries are omitted.
- `total_indexed_paper_count`: distinct stored paper IDs for the topic across the
  entire corpus, including undated papers, independent of the requested interval.

Overlapping topics count a paper once **within each topic**; totals across topics
can exceed the number of papers. Counts are not an exclusive composition.

All topic counts and whole-corpus bounds are computed together in one SQL
statement, without per-topic queries. The metadata does not fetch ETL freshness
for this endpoint.

## Shared filtering utilities

`backend/app/services/research_filters.py` provides strict date parsing, UTC
boundaries, a publication-date predicate, topic normalization/existence validation,
and reusable FastAPI dependencies.

Dates must be exactly `YYYY-MM-DD` and valid calendar dates. Missing sides remain
unbounded; the backend supplies no default range or history limit. SQL uses:

```text
published_date >= aware UTC midnight on date_from
published_date < aware UTC midnight on the day after date_to
```

Thus the last microsecond of `date_to` is included and the following midnight is
excluded. Bounds do not depend on the PostgreSQL session timezone. `date_to` of
`9999-12-31` returns 422 because Python cannot represent its following midnight.
Malformed dates and reversed ranges also return 422.

The shared topic dependency accepts repeated positive integer IDs, e.g.
`?topic_id=1&topic_id=2`, deduplicates/sorts them and validates against `dim_topic`
with one parameterized query. Omitted or empty selections require no query.
Unknown, non-integer or nonpositive IDs return 422. Selection validation does
not define ANY/ALL evidence semantics. **Neither Phase 1A endpoint accepts a
`topic_id` filter**; both Phase 1B endpoints use this shared dependency.

## Errors

- `200`: valid response, including empty results.
- `422`: invalid supported query input.
- `500`: database/service failure, with a generic message and no connection details.

Historical observations and topic labels describe the indexed dataset, not all AI
research. Topics are substring/keyword detections from titles and abstracts;
classification noise and overlap remain possible. Counts measure publication
activity, not impact or research quality.

## Read-only baseline observed on 14 October 2026

The configured Supabase database was queried in a read-only transaction. These
are observations from that execution, not API constants or completeness evidence.

| Check | Observed result |
|---|---|
| Stored IDs / dated / undated | 14,147 / 14,147 / 0 |
| Tagged / untagged | 11,210 / 2,937 |
| Configured topics | 8 |
| Earliest publication timestamp | `2026-06-17T07:41:41Z` |
| Latest publication timestamp | `2026-10-08T17:59:58Z` |
| Latest recorded run | `SUCCESS`; started `2026-10-13T02:36:01.057543Z` |
| Latest successful completion | `2026-10-13T02:36:23.123166Z` |
| IDs matching `v[0-9]+$` | 14,147 |
| Duplicate underlying-ID groups after stripping suffixes | 56 |
| Additional stored IDs after stripping suffixes | 56 |

Per-topic lifetime counts: agents 2,466; llm 4,757; multimodal 1,817; rag 3,752;
reasoning 2,035; rl 981; robotics 1,490; vision 4,750.

Fact/bridge columns, primary keys and foreign keys were inspected. Their relevant
definitions match the repository warehouse model. `etl_runs` has UUID `run_id`,
timestamptz `start_time`/`end_time`, text `status`, execution counts, numeric
`duration_seconds` and text `error_message`; repository DDL remains absent.

All 29 `vw_*` analytical view definitions were inspected. Existing session-timezone
casts, distinct counts and current-date growth logic remain unchanged. Existing
indexes include publication-date and primary-category indexes, bridge composite
primary keys, topic identity/name indexes, and a deployed full-text GIN index not
listed in repository `schema.sql`. No schema, view or index changes were made.

Versioned IDs can count revisions of one underlying work separately. Phase 1A
reports stored IDs and does not canonicalize identifiers or change ingestion.
Historical completeness, continuous ingestion and query-performance baselines
have not been established by this validation.

## Tests

Database-free focused tests:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider tests/test_research_filters.py tests/test_intelligence_api.py tests/test_intelligence_service.py -q
```

Read-only SQL fixture checks and existing connection regression:

```sh
INTELLIGENCE_SQL_TESTS=1 PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider tests/test_intelligence_service.py tests/test_etl_connection.py -q
```

The six SQL fixture tests are opt-in. They shadow table names with `VALUES` CTEs
inside production SELECT queries; they create no tables and write no warehouse
data. They require an available PostgreSQL connection. Normal unit tests mock
imports of `app.db` so production pool creation is not required. API tests invoke
ASGI directly, avoiding any new HTTP client dependency.

The fixtures intentionally repeat a paper/topic relationship to exercise distinct
counting. The deployed `paper_topics` primary key `(paper_id, topic_id)` normally
prevents duplicate bridge pairs; overlapping assignments to different topics are
valid and are also covered by the fixtures. The final-day fixture includes
`23:59:59.999999 UTC` and excludes the following midnight.

## Phase 1B reporting conventions

Both new endpoints preserve the Phase 1A metadata/envelope contract. Metadata
`date_from`/`date_to` echo requested parameters; `data.interval` reports the actual
resolved inclusive UTC interval. Omitted sides resolve to the earliest/latest
observed **whole-corpus** publication dates, independent of selected topics.
Explicit dates are retained, never silently clipped to observations. If one
omitted side resolves to a boundary inconsistent with the explicit side, return
422 rather than invent a range.

Empty dated corpora preserve configured topic options. Momentum returns empty
point arrays. Matrix returns zero window/period counts, nullable comparison windows
when reporting dates cannot resolve, and unchanged lifetime counts (which may
include undated papers). Missing interval sides remain null; no dates are invented.
If explicit dates resolve both matrix boundaries, the same containment validation
applies even when the corpus is empty.

Corpus bounds and analytical counts use separate SQL statements. Ingestion
between those statements can change observations; the APIs do not promise a
cross-query snapshot. Every aggregate uses distinct stored paper IDs. These may
include multiple revisions of an underlying work, and topics overlap.

## GET /intelligence/momentum

| Parameter | Default | Behavior |
|---|---|---|
| `date_from`, `date_to` | Omitted | Inclusive UTC dates; omitted sides resolve from observations. |
| Repeated `topic_id` | All configured topics | Positive, known integer IDs; sorted/deduplicated by shared validation. |
| `mode` | `count` | `count` or `index`; other modes return 422. |
| `include_partial_weeks` | `true` | Include clipped boundary weeks; false excludes them without rescaling. |

Examples:

```text
GET /intelligence/momentum
GET /intelligence/momentum?date_from=2026-07-01&date_to=2026-07-31&topic_id=5&topic_id=3&mode=index
GET /intelligence/momentum?include_partial_weeks=false
```

The resolved interval may intersect **at most 104 UTC calendar weeks**, including
partial first/final weeks. Larger intervals return 422 before generating a calendar;
no silent truncation occurs. Unrepresentable calendar boundaries also return 422.
A bounded explicit interval outside observed dates is zero-filled and warned about;
those zeros are indexed counts, not evidence of no research activity.

Each bucket begins Monday 00:00 UTC and ends at the next Monday, exclusive.
PostgreSQL truncation explicitly converts publication timestamps to UTC; calendar
stepping uses timestamp-without-timezone dates to avoid session/DST effects.
Date predicates apply **before** grouping, so partial counts reflect only the
selected dates. Selected topics are crossed with the weekly calendar; missing
observations become zero, including topics with no papers.

Illustrative `data` shape (the unchanged metadata envelope surrounds this object):

```json
{
  "mode": "index",
  "interval": {"date_from": "2026-07-01", "date_to": "2026-07-31"},
  "topics": [{
    "topic_id": 5,
    "topic_name": "agents",
    "baseline_week_start": "2026-07-06",
    "baseline_count": 25,
    "points": [{
      "week_start": "2026-07-06",
      "week_end_exclusive": "2026-07-13",
      "effective_start": "2026-07-06T00:00:00Z",
      "effective_end_exclusive": "2026-07-13T00:00:00Z",
      "paper_count": 25,
      "index_value": 100.0,
      "is_partial_week": false
    }]
  }]
}
```

`week_start` and `week_end_exclusive` are ISO calendar dates interpreted as UTC
midnights. Effective boundaries are aware ISO timestamps: the intersection of the
reporting interval and the bucket. `is_partial_week` describes calendar clipping
only; even a full week has unknown ingestion coverage. Partial volumes must not be
compared as full-week volumes; they are never extrapolated.

In `count` mode, baseline fields and `index_value` are null. In `index` mode:

- Baseline is the first full week in the reporting interval, regardless of count.
- `index_value = 100 * paper_count / baseline_count`; raw counts remain available.
- A zero baseline retains its week and zero count, but **all** topic index values
  are null. The baseline never advances to a later nonzero week.
- If no full week exists, baseline fields and indices are null with a warning.
- Included partial buckets can have indices, but remain flagged and warned about.

Indices compare observed activity to a selected baseline; they are not forecasts,
impact measures, or statistically significant growth estimates.

## GET /intelligence/momentum-matrix

| Parameter | Default | Behavior |
|---|---|---|
| `date_from`, `date_to` | Omitted | Resolved inclusive reporting interval as above. |
| Repeated `topic_id` | All configured topics | Same validated selection behavior as momentum. |
| `window_weeks` | `4` | Integer 2–12 per comparison window; otherwise 422. |

Examples:

```text
GET /intelligence/momentum-matrix
GET /intelligence/momentum-matrix?date_from=2026-09-01&date_to=2026-10-08&window_weeks=2&topic_id=5
```

Take the earlier of the reporting exclusive upper boundary and current UTC time.
The last Monday midnight at or before that instant ends the recent window.
Subtract `window_weeks` to get its start; subtract the same duration again for the
previous start. Both windows are half-open, adjacent, non-overlapping and contain
only full calendar weeks. The current incomplete UTC week is excluded.

Both windows must fit inside the resolved reporting interval; otherwise return
422. The API never expands the interval to fetch comparison history. Matrix has
no 104-week reporting restriction because it does not generate a weekly calendar.

Illustrative `data` shape:

```json
{
  "window_weeks": 2,
  "interval": {"date_from": "2026-09-01", "date_to": "2026-10-08"},
  "previous_window": {"start": "2026-09-07T00:00:00Z", "end_exclusive": "2026-09-21T00:00:00Z"},
  "recent_window": {"start": "2026-09-21T00:00:00Z", "end_exclusive": "2026-10-05T00:00:00Z"},
  "topics": [{
    "topic_id": 5,
    "topic_name": "agents",
    "previous_paper_count": 30,
    "recent_paper_count": 45,
    "absolute_change": 15,
    "growth_percent": 50.0,
    "growth_state": "growing",
    "low_baseline": false,
    "period_paper_count": 100,
    "total_indexed_paper_count": 2466
  }]
}
```

Numbers are illustrative. Window boundaries are aware UTC timestamps.

- `absolute_change = recent_paper_count - previous_paper_count`.
- `growth_percent = 100 * absolute_change / previous_paper_count`; zero previous
  count returns null, never infinite growth.
- `growth_state`: `no_baseline` whenever previous count is zero (including
  zero/zero), otherwise `growing`, `declining`, or `stable` according to the change.
- `low_baseline`: previous count **below 10**. Ten is a product heuristic, not a
  statistical significance threshold. Raw counts and warnings remain available.
- `period_paper_count`: distinct dated topic papers in the entire resolved
  reporting interval, including dates outside the comparison windows.
- `total_indexed_paper_count`: distinct topic-associated paper IDs in the entire corpus,
  including undated papers; changing dates never changes this lifetime definition.

Zero-count topics are retained. Equal calendar windows do not establish equal
source coverage. Growth remains descriptive of indexed publication activity.

## Phase 1B validation

Focused unit/API tests and opt-in PostgreSQL fixtures are in
`tests/test_intelligence_momentum.py`. They exercise production service SQL against
read-only CTE fixtures, including deliberately repeated bridge pairs, overlapping
topics, zero-filled weeks, clipping, fixed/zero baselines, lifetime independence,
growth states and session timezone changes. Phase 1A tests remain operational.

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider tests --ignore=tests/test_etl_connection.py -q
PGOPTIONS='-c default_transaction_read_only=on' INTELLIGENCE_SQL_TESTS=1 PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider tests -q
```

## Phase 1C interval and selection conventions

Both endpoints below use the unchanged `{meta, data}` envelope and the shared
strict ISO date/topic validation. `date_from` and `date_to` remain optional:
omitted sides are **unbounded**, as in Phase 1A. These endpoints do not resolve
missing sides to corpus bounds or inherit the momentum calendar limit.

Inclusive UTC dates become aware midnight lower bounds and exclusive midnight
bounds after `date_to`. Undated papers are excluded, including unbounded requests.
Data and metadata echo the requested dates; observed metadata dates describe the
whole corpus. Coverage remains `unknown` and warnings describe automatic topic
classification noise. A single SQL statement computes bounds and all aggregates
for each endpoint, so they share one database snapshot.

Repeated positive integer `topic_id` values are validated against `dim_topic`,
deduplicated and sorted. Omitted IDs select every configured topic. Selected-topic
output is ordered by `topic_name` ascending, then `topic_id`. Zero-count topics
remain present. Selecting topics restricts returned topic dimensions and edges,
not the underlying date-filtered paper corpus or any category denominator.

## GET /intelligence/relationships

| Parameter | Default | Behavior |
|---|---|---|
| `date_from`, `date_to` | Unbounded | Optional inclusive UTC ISO dates. |
| Repeated `topic_id` | All configured topics | Validated topic selection. |
| `min_shared_papers` | `1` | Integer at least 1; threshold applies only to edges. |

Example:

```text
GET /intelligence/relationships?date_from=2026-08-01&date_to=2026-10-01&topic_id=1&topic_id=3&min_shared_papers=5
```

`data` contains:

```json
{
  "date_from": "2026-08-01",
  "date_to": "2026-10-01",
  "min_shared_papers": 5,
  "nodes": [{"topic_id": 1, "topic_name": "Example Topic", "paper_count": 1200}],
  "edges": [{
    "topic_a_id": 1,
    "topic_b_id": 3,
    "shared_paper_count": 400,
    "jaccard_similarity": 0.25
  }]
}
```

The shape is illustrative; actual nodes include all selected topics, including
both ends of each edge. Each node's `paper_count` is its entire date-filtered
membership total, independent of edge thresholds and other selected topics.

For unordered topics A and B:

- `C(A,B) = distinct stored paper IDs assigned to both A and B`.
- `Jaccard = C(A,B) / (N(A) + N(B) - C(A,B))`, where N uses full date-filtered
  topic totals before thresholding.

Edges use canonical IDs `topic_a_id < topic_b_id`: no self-links or reverse links.
Edges are sorted by those two IDs. `min_shared_papers` never changes node totals,
Jaccard denominators or metadata. One selected topic returns one node and no
edges. Empty activity, disconnected selections and thresholds above all counts
return retained nodes and an empty edge list.

Jaccard is a **fraction in [0,1]**, rounded to six decimal places, not multiplied
by 100. JSON numbers do not pad trailing zeros. A zero union produces null
rather than division by zero; such a union cannot ordinarily support an edge
under the positive shared-paper threshold.

Co-occurrence demonstrates topic association within indexed papers. It does
**not** establish temporal convergence, increasing connectedness, causality,
research quality or statistical significance.

## GET /intelligence/topic-category-heatmap

| Parameter | Default | Behavior |
|---|---|---|
| `date_from`, `date_to` | Unbounded | Same inclusive UTC contract. |
| Repeated `topic_id` | All configured topics | Restricts the topic dimension only. |
| `category_scope` | `all` | `all` or `primary`; other values return 422. |

Examples:

```text
GET /intelligence/topic-category-heatmap
GET /intelligence/topic-category-heatmap?topic_id=2&category_scope=primary
```

`all` uses `paper_categories`, including both primary and secondary associations.
`primary` uses the exact `fact_papers.primary_category` code matched against
`dim_category.category_code`; association ordering does not determine primary
status. Missing/unmapped primary codes contribute no primary-category cell, but
still contribute to their topic's denominator.

Illustrative `data` shape:

```json
{
  "date_from": null,
  "date_to": null,
  "category_scope": "all",
  "topics": [{"topic_id": 1, "topic_name": "Example Topic", "paper_count": 1200}],
  "categories": [{"category_id": 1, "category_code": "cs.LG", "paper_count": 2500}],
  "cells": [{
    "topic_id": 1,
    "category_id": 1,
    "paper_count": 400,
    "category_prevalence_pct": 16.0,
    "topic_distribution_pct": 33.333333
  }]
}
```

For topic T/category C, with distinct stored IDs as the counting grain:

- `N(T,C)`: date-filtered papers assigned to both T and C under the selected scope.
- `category_prevalence_pct = 100 * N(T,C) / N(C)`.
- `topic_distribution_pct = 100 * N(T,C) / N(T)`.

N(C) includes **all** date-filtered category papers, including untagged papers and
papers with only unselected topics. Selecting one topic cannot change category
counts. N(T) includes all dated papers for the topic and cannot change when
switching category scope. Individual percentages are in [0,100], rounded to six
decimal places using the same convention as Jaccard.

Only categories with date-filtered activity under the selected scope are returned,
including categories with zero matches to selected topics. There is no top-N cap.
Categories sort by descending paper count, then category code and ID. Cells follow
selected-topic order, then returned-category order, and cover their complete
Cartesian product.

A zero match returns count 0 and percentage 0.0 if its denominator is positive.
A zero denominator returns null for that percentage. For example, a zero-paper
topic with an active category returns category prevalence 0.0 and topic
distribution null. If there are no active categories, categories/cells are empty
while selected zero-count topics remain available.

Multi-topic and multi-category papers legitimately contribute to multiple cells;
summed cells are not a distinct corpus count. Under `all`, topic distributions
can sum above 100%. Under `primary`, they sum approximately to 100% only when
all topic papers have valid primary-category mappings (minor rounding differences
are possible).

## Phase 1C SQL and validation

Shared internal CTEs establish the filtered paper corpus and selected topic
memberships. Date filtering precedes pair/category expansion. DISTINCT protects
each association count; configured zero-count topics are preserved by LEFT JOIN.
Category denominators are computed independently of topic joins. Each endpoint
uses one set-based aggregation statement; heatmap zero-filling happens in Python
without per-cell queries. Existing indexes, schema and views remain unchanged.

`tests/test_intelligence_associations.py` covers unit/API behavior and opt-in
read-only PostgreSQL fixtures. Fixtures deliberately repeat bridge pairs despite
the deployed composite primary keys preventing those duplicates. They also
exercise untagged papers, categories supported only by unselected topics,
unmapped primary codes, zero topics, UTC final-day boundaries and timezone changes.
The documented full-suite commands above include these tests.

Stored arXiv revisions remain separate paper IDs. Keyword-based tags may be noisy;
observed history and successful ETL execution do not verify historical completeness.
