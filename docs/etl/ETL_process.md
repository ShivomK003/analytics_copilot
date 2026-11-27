## ETL Pipeline

The ETL pipeline fetches recent AI-related papers from arXiv, standardizes and validates them, builds warehouse-style CSVs, incrementally loads only new papers into Supabase PostgreSQL, and records run metadata plus logs for each execution.

Run the pipeline with:

```bash
uv run python -m etl.run_pipeline
```

Run the ETL test suite with:

```bash
uv run python -m pytest tests/etl -q
```

Recorded results from an earlier local pipeline run:

- raw papers fetched: `600`
- unique clean papers: `494`
- duplicates removed during transformation: `106`
- validation status: `PASS`
- first incremental run: `494` new papers
- immediate second run: `0` new papers and `494` duplicates skipped
- failure-path tests: `6 passed`

Documentation:

- [ETL Overview](etl_overview.md)
- [Data Model](data_model.md)
- [ETL Runbook](etl_runbook.md)
