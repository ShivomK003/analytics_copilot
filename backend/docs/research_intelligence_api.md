# Research Intelligence API — Phases 1A–1D

Phase 1A adds read-only corpus coverage and research topic options. Existing
paper, author, dashboard, trend, topic and category APIs remain unchanged.
Phase 1B adds weekly momentum and comparable-window momentum matrix datasets.
Phase 1C adds topic relationships and topic–category heatmap datasets.
Phase 1D adds weekly Research Composition and Unified Evidence Retrieval.

## Response conventions

All intelligence endpoints return `{ "meta": {...}, "data": ... }` using Pydantic response
models. Dates serialize as ISO `YYYY-MM-DD`; timestamps include a UTC offset
(or `Z`). Metadata contains:

| Field | Meaning |
|---|---|
| `date_from`, `date_to` | Requested inclusive dates; null means omitted. Momentum, momentum matrix and composition resolve omitted bounds using observed data; consumers must use `data.interval` for their resolved reporting dates. Topics, relationships, heatmap and evidence retain unbounded semantics for omitted sides. Coverage has no date parameters, so both are null. |
| `timezone` | Always `UTC`. |
| `observed_date_from`, `observed_date_to` | Earliest/latest observed publication dates in the **whole indexed corpus**, independent of the selected topic-count interval. Null if no dated papers exist. |
| `coverage_status` | Always `unknown` in Phases 1A–1D. No auditable completeness source is currently implemented. |
| `warnings` | Human-readable caveats about unverified history, automatic topic labels, undated publications, and unavailable ETL freshness where applicable. |

Observed bounds do not prove continuous or complete ingestion between them.
`unknown` means completeness has not been verified; it does not assert a gap.
A successful ETL run indicates execution freshness, not historical completeness.

Database acquisition uses the existing ten-connection pool with a bounded
30-second wait for capacity. This is separate from the 15-second connection-open
timeout and does not impose a query execution deadline. When capacity waiting
expires, the application returns HTTP 503 with
`{"detail":"Database is temporarily busy. Please retry."}` and `Retry-After: 1`.
Unexpected topic-validation database errors return generic JSON HTTP 500;
invalid client selections still return HTTP 422.

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

## GET /intelligence/composition (Phase 1D)

Weekly composition reports **overlapping topic prevalence**, not a mutually
exclusive allocation of publications. It uses the same calendar/clipping helpers
as momentum, preserving the existing momentum response contract.

| Parameter | Default | Behavior |
|---|---|---|
| `date_from`, `date_to` | Observed bounds for omitted sides | Inclusive UTC ISO dates; finite reporting interval. |
| Repeated `topic_id` | All configured topics | Standard validated, sorted/deduplicated chart selection. |
| `include_partial_weeks` | `true` | Include clipped boundary weeks; false excludes them without rescaling. |

Example:

```text
GET /intelligence/composition?date_from=2026-07-01&date_to=2026-07-31&topic_id=5&topic_id=3
```

Response uses the standard metadata envelope. Illustrative `data`:

```json
{
  "interval": {"date_from": "2026-07-01", "date_to": "2026-07-31"},
  "topics": [{"topic_id": 5, "topic_name": "agents"}],
  "weeks": [{
    "week_start": "2026-06-29",
    "week_end_exclusive": "2026-07-06",
    "effective_start": "2026-07-01T00:00:00Z",
    "effective_end_exclusive": "2026-07-06T00:00:00Z",
    "is_partial_week": true,
    "total_papers": 100,
    "topics": [{"topic_id": 5, "topic_papers": 25, "prevalence_pct": 25.0}]
  }]
}
```

Actual output includes every intersecting week and selected topic, in ascending
week order and the established topic-name/ID order. No published history means
no invented calendar, while configured topic options remain available. A corpus
without configured topics still returns weekly total counts and empty topic arrays.

For each effective week:

- `total_papers`: distinct **all dated papers** in the clipped publication cohort,
  including untagged papers and papers with only unselected topics.
- `topic_papers`: distinct papers in that same cohort assigned to this topic.
- `prevalence_pct = 100 * topic_papers / total_papers`, rounded to six decimal places.

Topic selection does not change the denominator. Duplicate bridge pairs do not
inflate numerators. When no papers exist in a generated week, counts are zero and
prevalence is null. When papers exist but a topic has no matches, prevalence is 0.0.
A paper may contribute to several topics, so percentages **may sum above 100%**;
they are never normalized to an exclusive composition.

The reporting interval may intersect at most 104 UTC Monday-based calendar weeks,
including partial weeks. Excessive or unsupported intervals return 422, as for
momentum. Partial weeks clip **both** numerator and denominator to effective
boundaries. They are flagged, not rescaled to full-week volumes. A full calendar
week still has unknown ingestion completeness. Metadata echoes requested dates;
`data.interval` contains resolved dates.

## GET /intelligence/evidence (Phase 1D)

Returns publications supporting the analytics' **dated** paper populations.
Undated publications are excluded even with no date parameters, consistently with
all intelligence interval/count conventions. Existing Explorer APIs retain their
separate discovery behavior.

| Parameter | Default | Behavior |
|---|---|---|
| `date_from`, `date_to` | Unbounded | Inclusive UTC ISO dates, with exclusive next-day SQL upper bound. |
| Repeated `topic_id` | No topic restriction | Zero, one or two positive known IDs. Two IDs mean **both topics**, not either. |
| `category` | No category restriction | Known `dim_category.category_code`; trimmed and case-insensitively resolved to its stored code. Blank, unknown or ambiguous codes return 422. |
| `category_scope` | `all` | `all` matches any bridge association; `primary` matches `fact_papers.primary_category` exactly. |
| `limit` | `20` | Integer 1–100. |
| `offset` | `0` | Integer 0–9223372036854775807 (PostgreSQL's representable OFFSET range). |

More than two IDs or **duplicate evidence topic IDs** return 422. Evidence does not
silently deduplicate a requested pair. Chart endpoints retain their existing
selection normalization. Invalid scopes, dates, topic IDs or pagination values
return 422. Database/validation-query failures return generic 500 responses and
are not converted into valid empty evidence.

Examples:

```text
GET /intelligence/evidence?topic_id=5&date_from=2026-07-06&date_to=2026-07-12
GET /intelligence/evidence?topic_id=1&topic_id=3&limit=20&offset=20
GET /intelligence/evidence?topic_id=2&category=cs.CV&category_scope=primary
```

The standard `{meta, data}` envelope surrounds:

```json
{
  "total": 45,
  "limit": 20,
  "offset": 0,
  "has_more": true,
  "records": [{
    "paper_id": "example-id",
    "title": "Example publication",
    "abstract": null,
    "published_date": "2026-07-10T12:00:00Z",
    "authors": ["Example Author"],
    "primary_category": "cs.AI",
    "arxiv_url": null,
    "pdf_url": null
  }]
}
```

Values are illustrative. Fields come from existing `vw_paper_details`; authors
are its sorted, distinct author-name array, not disambiguated researcher IDs.
Publication timestamps serialize in UTC regardless of session timezone. Optional
text/link fields retain null values rather than invent data.

Matching rows are one fact row per stored ID. Separate `EXISTS` predicates avoid
many-to-many multiplication and implement the two-topic intersection. Pagination
therefore follows deduplication by construction. Page IDs are selected first,
then joined to the existing detail view; no per-paper detail queries or duplicate
author serializer are introduced. Ordering is `published_date DESC, paper_id ASC`.
Count and records are computed in one SQL statement/snapshot.

`has_more` is true when `offset + returned_record_count < total`. Offsets at or
beyond the total return an empty page, the unchanged total, and false. With no
category filter, category scope does not further restrict the population. Two
categories are not supported. Offset pagination is deterministic within a stable
warehouse; concurrent ingestion between separate requests can shift pages.

## Mapping chart interactions to evidence

All current analytical bucket/window boundaries are UTC midnights, so existing
inclusive date filters reproduce them exactly. For a half-open interval
`[effective_start, effective_end_exclusive)`, use:

```text
date_from = effective_start UTC date
date_to   = effective_end_exclusive UTC date minus one day
```

| Interaction | Evidence filters | Matching measure |
|---|---|---|
| Momentum topic/week | Topic ID + point's effective dates | `paper_count` |
| Composition topic/week | Topic ID + week's effective dates | `topic_papers` |
| Composition weekly denominator | Same effective dates, omit topics | `total_papers` |
| Relationship edge | Both topic IDs + selected interval dates | `shared_paper_count` |
| Heatmap cell | Topic ID + category code + selected scope/dates | Cell `paper_count` |
| Momentum Matrix topic/window | Topic ID + previous/recent half-open window converted as above | Corresponding window paper count |

Use effective clipped dates for partial momentum/composition weeks, not the entire
calendar bucket. Relationship/heatmap omitted sides remain unbounded. Matrix
comparison windows already contain full weeks. No new timestamp-filter interface
is needed to reproduce these current contracts.

## Phase 1D validation and limitations

`tests/test_intelligence_composition_evidence.py` exercises overlapping/duplicate
tags, untagged denominators, zero weeks, partial boundaries, topic/category
validation, pagination ties, all/primary category semantics and evidence count
reconciliation with all five analytics datasets. Read-only fixtures use the actual
repository detail-view SELECT, never its DDL, to verify author serialization.
The complete offline suite is run with the live connection test excluded; opt-in
PostgreSQL fixture tests require the existing configured connection.

Shared UTC helpers and schema/ETL contracts remain unchanged. Stored versions count
as separate IDs; topic classifications can overlap and be noisy. Historical
coverage remains unknown. Evidence does not add embeddings, semantic similarity,
search ranking, authentication or AI functionality.
