# ETL Runbook

## Purpose

This runbook is the operational guide for running, testing, monitoring, and troubleshooting the ETL pipeline.

## Setup

### Python Environment

Create and activate a Python environment, then install dependencies from the project's existing dependency source:

```bash
pip install -r backend/requirements.txt
```

### Environment File

The ETL loads environment variables from:

```text
backend/.env
```

Required variables:

- `SUPABASE_HOST`
- `SUPABASE_PORT`
- `SUPABASE_DB`
- `SUPABASE_USER`
- `SUPABASE_PASSWORD`

Do not store real credentials in documentation or commit them to the repository.

## Run the Full Pipeline

```bash
python -m etl.run_pipeline
```

Expected successful behavior:

- ETL starts and creates or updates required local directories
- a new `etl_runs` row is started with status `RUNNING`
- papers are fetched from arXiv
- raw data is transformed and deduplicated
- validation returns `PASS`
- warehouse CSVs are regenerated
- only new papers are inserted into Supabase
- `etl_runs` is updated to `SUCCESS`
- logs are written to console and `logs/etl.log`

## Run Tests

```bash
python -m pytest tests -q
```

Current expected result from the latest verified local run:

```text
6 passed
```

Latest verified result reported for the suite:

```text
6 passed in 1.84s
```

## Generated Outputs

### `data/raw/`

- contains `arxiv_papers_raw.csv`
- replaced on each ETL run

### `data/clean/`

- contains `arxiv_papers_clean.csv`
- replaced on each ETL run

### `data/warehouse/`

- contains regenerated warehouse CSVs:
  - `fact_papers.csv`
  - `dim_author.csv`
  - `dim_category.csv`
  - `dim_topic.csv`
  - `paper_authors.csv`
  - `paper_categories.csv`
  - `paper_topics.csv`
- regenerated on each ETL run
- not modified by the database loader

### `data/reports/`

- contains `quality_report.json`
- replaced on each validation run

### `logs/etl.log`

- receives appended log entries through Python logging
- created automatically when the ETL logger is initialized

## Verify Incremental Loading

Use this quick operational check:

1. Run the pipeline once.
2. Run the pipeline again immediately.

Expected second run behavior:

- `new_papers_loaded = 0`
- `duplicates_skipped > 0`
- database row counts do not double

Latest verified local result:

- first incremental run: `494` new papers
- immediate second run: `0` new papers and `494` duplicates skipped

## Inspect ETL Runs

Useful SQL queries:

```sql
select *
from etl_runs
order by start_time desc
limit 20;
```

```sql
select status, count(*)
from etl_runs
group by status;
```

```sql
select
    start_time,
    end_time,
    papers_fetched,
    new_papers_loaded,
    duplicates_skipped,
    status,
    duration_seconds,
    error_message
from etl_runs
order by start_time desc;
```

## Logging and Failure Behavior

Logs are written to:

```text
logs/etl.log
```

Logged events include:

- pipeline start
- ETL run ID
- fetched paper count
- post-transform counts
- validation status
- warehouse row counts
- load metrics
- success or failure
- duration
- traceback on exception

Failure sequence:

```text
exception occurs
  ->
load transaction rolls back
  ->
FAILED metadata is written independently
  ->
error is logged with traceback
  ->
exception is re-raised
  ->
process exits with failure
```

## Troubleshooting

### Missing Environment Variables

- Symptom: pipeline fails before extraction with a missing env error
- Likely cause: one or more required Supabase variables are absent from `backend/.env`
- How to check: inspect the exception raised by `etl.config.validate_environment()`
- How to fix: add the missing variables to `backend/.env`

### Supabase Connection Refused

- Symptom: the pipeline fails when opening the metadata or load connection
- Likely cause: host, port, credentials, or network access is wrong
- How to check: verify `SUPABASE_HOST`, `SUPABASE_PORT`, `SUPABASE_DB`, `SUPABASE_USER`, and `SUPABASE_PASSWORD`
- How to fix: correct the connection settings and retry

### arXiv Request Failure

- Symptom: extraction fails with `Failed to fetch arXiv data for category ...`
- Likely cause: arXiv is unavailable, network is blocked, or the request timed out
- How to check: inspect the exception chain in console output or `logs/etl.log`
- How to fix: retry later or confirm outbound connectivity to `https://export.arxiv.org/api/query`

### Validation Status `FAIL`

- Symptom: run stops after validation and does not build warehouse CSVs or load the database
- Likely cause: at least one critical validation count is greater than zero
- How to check: open `data/reports/quality_report.json`
- How to fix: inspect the clean CSV for missing IDs, missing text fields, invalid dates, or duplicate `paper_id` values

### Warehouse Consistency Error

- Symptom: warehouse build raises a `ValueError` about duplicates or missing keys
- Likely cause: the clean dataset produced duplicate dimension rows or invalid bridge references
- How to check: inspect the exception message from `etl/warehouse/build_warehouse_tables.py`
- How to fix: inspect `data/clean/arxiv_papers_clean.csv` and rerun after correcting the source issue

### Database Rollback

- Symptom: ETL fails during loading and no partial load is committed
- Likely cause: one of the fact, dimension, or bridge insert steps failed
- How to check: review `logs/etl.log` and the latest `etl_runs.error_message`
- How to fix: resolve the insert failure and rerun; the loader rolls back failed transactions automatically

### GitHub Actions Secret Missing

- Symptom: the workflow fails before or during the ETL command on GitHub Actions
- Likely cause: one or more required secrets were not configured in the repository settings
- How to check: inspect workflow logs for missing env-related failures
- How to fix: add these secrets in GitHub:
  - `SUPABASE_HOST`
  - `SUPABASE_PORT`
  - `SUPABASE_DB`
  - `SUPABASE_USER`
  - `SUPABASE_PASSWORD`

### `logs/etl.log` Unavailable

- Symptom: log file is missing or cannot be opened
- Likely cause: the pipeline failed before logger setup, directory creation was skipped, or the file is locked by another process
- How to check: confirm `logs/` exists and the ETL logger was initialized
- How to fix: rerun the pipeline after releasing any file lock and ensure the process can write to the project workspace

## Test Coverage

Current tests and what they cover:

- `tests/test_etl_connection.py`
  - verifies the ETL can connect to the configured database and query `fact_papers`
- `tests/test_validation_failure.py`
  - verifies validation returns `FAIL` for a missing `paper_id`
  - verifies a validation failure stops the pipeline before warehouse build and database load
  - verifies failure metadata and failure logs are emitted for the validation-stop path
- `tests/test_database_failure.py`
  - verifies the loader rolls back when an insert step fails mid-load
- `tests/test_pipeline_failure_metadata.py`
  - verifies `finish_etl_run` writes `FAILED` metadata fields
  - verifies the pipeline records failure metadata and logs traceback information on a simulated database failure

The current tests cover:

- database connection
- validation failure stops loading
- database failure rollback
- failed metadata recording
- traceback logging
- failure-path handling for the tested scenarios

They do not claim full end-to-end ETL success-path coverage by themselves; successful end-to-end behavior is verified separately through local pipeline runs.

## GitHub Actions Scheduling

Workflow file:

```text
.github/workflows/daily_etl.yml
```

Current behavior:

- runs daily on cron: `0 0 * * *`
- supports manual execution with `workflow_dispatch`
- sets up Python `3.11`
- installs dependencies from `backend/requirements.txt`
- runs `python -m etl.run_pipeline`
- uploads `data/reports/quality_report.json` and `logs/etl.log`
- uploads artifacts even on failure with `if: always()`

Required GitHub Secrets:

- `SUPABASE_HOST`
- `SUPABASE_PORT`
- `SUPABASE_DB`
- `SUPABASE_USER`
- `SUPABASE_PASSWORD`

Manual trigger steps in GitHub:

1. Open the repository on GitHub.
2. Go to the `Actions` tab.
3. Select the `Daily ETL` workflow.
4. Click `Run workflow`.
5. Choose the branch if prompted.
6. Start the run with `Run workflow`.

## Latest Verified Local State

These values are snapshots from the latest verified local run, not fixed long-term expectations:

- raw papers fetched: `600`
- unique clean papers: `494`
- duplicates removed during transformation: `106`
- validation status: `PASS`
- papers without detected topics: `101`
- first incremental run: `494` new papers
- immediate second run: `0` new papers and `494` duplicates skipped
- current `fact_papers` count after successful load: `1008`
- failure-path tests: `6 passed`
