## ETL Pipeline

The ETL pipeline fetches recent AI-related papers from arXiv, standardizes and validates them, builds warehouse-style CSVs, incrementally loads only new papers into Supabase PostgreSQL, and records run metadata plus logs for each execution.

Run the pipeline with:

```bash
python -m etl.run_pipeline
```

Run the ETL test suite with:

```bash
python -m pytest tests -q
```

Current ETL status from the latest verified local run:

- raw papers fetched: `600`
- unique clean papers: `494`
- duplicates removed during transformation: `106`
- validation status: `PASS`
- first incremental run: `494` new papers
- immediate second run: `0` new papers and `494` duplicates skipped
- failure-path tests: `6 passed`

Documentation:

- [ETL Overview](docs/etl_overview.md)
- [Data Model](docs/data_model.md)
- [ETL Runbook](docs/etl_runbook.md)
