# ETL Pipeline Overview

## Purpose

The ETL pipeline ingests recent research papers from arXiv, standardizes and validates the data, builds warehouse-style CSVs, incrementally loads new records into Supabase PostgreSQL, and records operational metadata for each run.

Run the full pipeline with:

```bash
python -m etl.run_pipeline
```

## High-Level Flow

```text
arXiv API
  ->
Extraction
  ->
Raw CSV
  ->
Transformation and deduplication
  ->
Clean CSV
  ->
Data quality validation
  ->
Warehouse CSV generation
  ->
Incremental Supabase load
  ->
ETL metadata and logs
```

## Package Structure

```text
etl/
|-- config.py
|-- run_pipeline.py
|-- extract/
|-- transform/
|-- validate/
|-- warehouse/
|-- load/
|-- monitoring/
|-- docs/
`-- ETL_process.md
```

## File Responsibilities

| File | Responsibility | Main Public Function | Inputs | Outputs | Side Effects |
| --- | --- | --- | --- | --- | --- |
| `etl/config.py` | Centralizes project paths, environment loading, and DB config assembly | `ensure_directories`, `validate_environment`, `get_database_config` | `backend/.env`, process env | Path constants, DB config dict | Creates directories, raises on missing env vars |
| `etl/run_pipeline.py` | Canonical ETL entry point and stage orchestration | `run_pipeline` | Logger, DB metadata connection, stage return values | Run summary dict | Writes logs, inserts/updates `etl_runs`, triggers all ETL stages |
| `etl/extract/ingest_arxiv.py` | Fetches raw paper metadata from arXiv | `extract_arxiv_data` | arXiv categories, per-category result count | `{"papers_fetched": int}` | Calls arXiv API, writes `data/raw/arxiv_papers_raw.csv`, logs progress |
| `etl/transform/transform_arxiv.py` | Cleans and standardizes raw paper records | `transform_arxiv_data` | `data/raw/arxiv_papers_raw.csv` | `{"raw_papers": int, "clean_papers": int, "duplicates_removed": int}` | Writes `data/clean/arxiv_papers_clean.csv` |
| `etl/validate/validate_arxiv.py` | Runs critical and informational data-quality checks | `validate_arxiv_data` | `data/clean/arxiv_papers_clean.csv` | Validation report dict | Writes `data/reports/quality_report.json` |
| `etl/warehouse/build_warehouse_tables.py` | Builds fact, dimension, and bridge CSVs | `build_warehouse_tables` | `data/clean/arxiv_papers_clean.csv` | Warehouse row count dict | Writes all `data/warehouse/*.csv`, raises on consistency failures |
| `etl/load/load_supabase.py` | Incrementally loads warehouse data into Supabase PostgreSQL | `load_to_supabase` | Warehouse CSVs, database contents | `{"papers_available": int, "existing_papers": int, "new_papers_loaded": int, "duplicates_skipped": int}` | Opens DB transaction, inserts facts/dimensions/bridges, commits or rolls back |
| `etl/monitoring/logging_config.py` | Configures ETL logging | `setup_logging` | `logs/` path | Configured `logging.Logger` | Creates file and stream handlers for `logs/etl.log` and console output |
| `etl/monitoring/metadata.py` | Records ETL run lifecycle metadata | `start_etl_run`, `finish_etl_run` | Open DB connection, run metrics | `run_id` from `start_etl_run` | Inserts and updates `etl_runs` rows |

Package `__init__.py` files are present only as package markers and do not contain runtime ETL logic.

## Stage Details

### Extraction

- Source: arXiv Atom API at `https://export.arxiv.org/api/query`
- Categories queried:
  - `cs.AI`
  - `cs.LG`
  - `cs.CL`
  - `cs.CV`
  - `cs.RO`
  - `stat.ML`
- Papers requested per category: `ARXIV_MAX_RESULTS`, which defaults to `100`
- Request pacing: a `3` second delay is applied between category requests
- Output file: `data/raw/arxiv_papers_raw.csv`
- Returned metrics:

```python
{"papers_fetched": int}
```

- Failure behavior: `requests` failures are wrapped in `RuntimeError("Failed to fetch arXiv data for category ...")` and the pipeline stops

The raw extractor writes one combined CSV containing:

- `paper_id`
- `title`
- `abstract`
- `authors`
- `primary_category`
- `all_categories`
- `published_date`
- `updated_date`
- `pdf_url`
- `arxiv_url`

### Transformation

The transform stage reads `data/raw/arxiv_papers_raw.csv` and applies:

- paper ID normalization via `normalize_paper_id`
- title and abstract whitespace cleanup
- author parsing and deduplicated comma-separated normalization
- category parsing and deduplicated comma-separated normalization
- published and updated date parsing with UTC conversion
- `year`, `month`, and ISO `week` derivation from `published_date`
- keyword-based topic detection from the combined title and abstract text
- deduplication by `paper_id`

Output file:

- `data/clean/arxiv_papers_clean.csv`

Returned metrics:

```python
{
    "raw_papers": int,
    "clean_papers": int,
    "duplicates_removed": int,
}
```

Clean CSV columns:

- `paper_id`
- `title`
- `abstract`
- `authors`
- `primary_category`
- `all_categories`
- `published_date`
- `updated_date`
- `pdf_url`
- `arxiv_url`
- `year`
- `month`
- `week`
- `detected_topics`

### Validation

The validation stage reads `data/clean/arxiv_papers_clean.csv` and writes `data/reports/quality_report.json`.

Checks performed:

- missing `paper_id`
- missing `title`
- missing `abstract`
- missing `authors`
- invalid `published_date`
- duplicate `paper_id`
- papers without detected topics

`papers_without_detected_topics` is informational only and does not fail the run.

Critical checks are:

- `missing_paper_id`
- `missing_titles`
- `missing_abstracts`
- `missing_authors`
- `invalid_published_date`
- `duplicate_paper_id`

Validation outcomes:

- `PASS`: all critical counts are zero
- `FAIL`: one or more critical counts is greater than zero

When validation returns `FAIL`, `etl.run_pipeline` raises:

```text
Validation failed; skipping warehouse build and database load
```

That stops the pipeline before warehouse generation and database loading.

### Warehouse Generation

The warehouse stage reads the clean CSV and regenerates these outputs on every run:

- `data/warehouse/fact_papers.csv`
- `data/warehouse/dim_author.csv`
- `data/warehouse/dim_category.csv`
- `data/warehouse/dim_topic.csv`
- `data/warehouse/paper_authors.csv`
- `data/warehouse/paper_categories.csv`
- `data/warehouse/paper_topics.csv`

Generated content:

- `fact_papers.csv`: one row per cleaned paper
- dimension CSVs: unique authors, categories, and detected topics with locally generated IDs
- bridge CSVs: many-to-many relationships between papers and authors/categories/topics

Consistency checks performed before writing:

- no duplicate `paper_id` in `fact_papers`
- no duplicate author names in `dim_author`
- no duplicate category codes in `dim_category`
- no duplicate topic names in `dim_topic`
- no duplicate `(paper_id, dimension_id)` pairs in bridge tables
- every bridge `paper_id` exists in `fact_papers`
- every bridge dimension ID exists in the corresponding dimension CSV

Why these files are regenerated each run:

- they are derived artifacts built from the current clean dataset
- regeneration avoids depending on previously filtered or partial warehouse files
- the database loader treats them as immutable inputs and does not rewrite them

### Incremental Loading

The loader reads warehouse CSVs and loads only new papers into Supabase.

Logic:

```text
Read existing fact_papers.paper_id values
  ->
Compare them against warehouse paper IDs
  ->
Identify new_paper_ids
  ->
Insert only new fact rows
  ->
Insert missing dimension values
  ->
Fetch authoritative database dimension IDs
  ->
Remap bridge relationships
  ->
Insert bridge rows for new papers
```

Important implementation details:

- facts are inserted only for `new_paper_ids`
- dimensions are inserted by natural keys:
  - `author_name`
  - `category_code`
  - `topic_name`
- `ON CONFLICT DO NOTHING` is used for conflict-safe inserts
- bridge rows are inserted only for new papers

Why local dimension IDs are not trusted during loading:

- warehouse CSV dimension IDs are generated fresh on each run
- a regenerated local ID can point to a different author/category/topic than an existing database ID
- the loader inserts by natural key, re-queries the database, and remaps bridge rows to authoritative database IDs before inserting bridges

Transaction behavior:

- all fact, dimension, and bridge writes occur in one database transaction
- if any insert step fails, the loader calls `rollback()` and raises the exception
- only a successful full load is committed

Returned metrics:

```python
{
    "papers_available": int,
    "existing_papers": int,
    "new_papers_loaded": int,
    "duplicates_skipped": int,
}
```

## Metadata and Logging

Each pipeline run records metadata in `etl_runs` and writes logs to `logs/etl.log`.

Logged events include:

- pipeline start
- ETL run ID
- papers fetched
- transformation counts
- validation status
- warehouse row counts
- incremental load metrics
- success
- failure
- duration
- traceback on exceptions

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
command exits with failure
```

## Latest Verified Local Results

These values are the latest verified local run results, not fixed permanent expectations:

- raw papers fetched: `600`
- unique clean papers: `494`
- duplicates removed during transformation: `106`
- validation status: `PASS`
- papers without detected topics: `101`
- first incremental run: `494` new papers
- immediate second run: `0` new papers, `494` duplicates skipped
- current `fact_papers` count after the successful load: `1008`
- failure-path tests: `6 passed`
