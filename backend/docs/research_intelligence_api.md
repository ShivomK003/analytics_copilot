# Research Intelligence API — Phase 1A

Phase 1A adds read-only corpus coverage and research topic options. Existing
paper, author, dashboard, trend, topic and category APIs remain unchanged.
Visualization APIs and evidence-filter enhancements are not implemented.

## Response conventions

Both endpoints return `{ "meta": {...}, "data": ... }` using Pydantic response
models. Dates serialize as ISO `YYYY-MM-DD`; timestamps include a UTC offset
(or `Z`). Metadata contains:

| Field | Meaning |
|---|---|
| `date_from`, `date_to` | Requested inclusive dates; null means unbounded. Coverage has no date parameters, so both are null. |
| `timezone` | Always `UTC`. |
| `observed_date_from`, `observed_date_to` | Earliest/latest observed publication dates in the **whole indexed corpus**, independent of the selected topic-count interval. Null if no dated papers exist. |
| `coverage_status` | Always `unknown` in Phase 1A. No auditable completeness source is currently implemented. |
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
`topic_id` filter**; this helper is reserved for future callers.

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
