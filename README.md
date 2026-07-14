# Analytics Copilot

Analytics Copilot is a full-stack project for collecting AI research papers, loading them into a warehouse-style PostgreSQL model, and exposing analytics through a backend API and frontend dashboard.

## Project Areas

- `etl/`: extraction, transformation, validation, warehouse generation, loading, and ETL documentation
- `backend/`: API and database access layer
- `frontend/`: dashboard client
- `sql/`: warehouse schema and analytics queries
- `data/`: generated pipeline outputs and reports
- `tests/`: automated ETL-focused test coverage
- `.github/workflows/`: scheduled ETL automation

## Main Workflows

### Run the ETL pipeline

```bash
python -m etl.run_pipeline
```

### Run the backend

```bash
uvicorn backend.app.main:app --reload
```

### Run the frontend

```bash
cd frontend
npm run dev
```

### Run tests

```bash
python -m pytest tests -q
```

## Documentation

- ETL process guide: [etl/ETL_process.md](etl/ETL_process.md)
- ETL overview: [etl/docs/etl_overview.md](etl/docs/etl_overview.md)
- ETL data model: [etl/docs/data_model.md](etl/docs/data_model.md)
- ETL runbook: [etl/docs/etl_runbook.md](etl/docs/etl_runbook.md)
- Frontend starter notes: [frontend/README.md](frontend/README.md)

## Current Structure

```text
analytics_copilot/
|-- backend/
|-- data/
|-- etl/
|   |-- docs/
|   `-- ETL_process.md
|-- frontend/
|-- sql/
|-- tests/
`-- README.md
```
