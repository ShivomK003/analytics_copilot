# Analytics Metric Definitions

This document defines the analytical metrics exposed by the AI Research
Intelligence Copilot.

The analytics layer sits between the normalized warehouse tables and the
dashboard or AI copilot.

## Metric principles

1. Paper-based metrics count distinct `paper_id` values unless explicitly
   documented otherwise.
2. Publication metrics use `fact_papers.published_date`.
3. Publication date is different from ETL load date.
4. Week-based metrics use a week-start date rather than an isolated week
   number.
5. Category associations and primary categories are treated as separate
   concepts.
6. Topic percentages may sum to more than 100% because one paper may have
   multiple topics.
7. Analytical joins must avoid multiplying papers through bridge-table joins.

## Planned core metrics
| Metric | Definition | Source | Notes | Status |
|---|---|---|---|---|
| Total Papers | Count of distinct warehouse papers | `fact_papers` | Current warehouse total | Implemented |
| Papers Published Today | Papers whose publication date equals the database current date | `fact_papers.published_date` | Not papers loaded today | Implemented |
| Papers Published This Week | Papers published since the start of the current PostgreSQL week | `fact_papers.published_date` | Week begins Monday | Implemented |
| Papers Published This Month | Papers published since the start of the current calendar month | `fact_papers.published_date` | Database timezone applies | Implemented |
| Top Topic | Topic associated with the most distinct papers | `vw_paper_topics` | Multi-topic papers count once within each topic | Implemented |
| Top Category | Category associated with the most distinct papers | `vw_paper_categories` | Uses all category associations, not only primary category | Implemented |
| Top Author | Author associated with the most distinct papers | `vw_paper_authors` | Measures dataset activity, not impact | Implemented |
| Latest ETL Run | Most recently started ETL execution | `etl_runs` | Ordered by start time and run ID | Implemented |