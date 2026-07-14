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

## Core KPI Metrics

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

## Time-Series Metrics

| Metric | Definition | Source | Notes | Status |
|---|---|---|---|---|
| Daily Paper Count | Count of distinct papers for each publication date | `vw_daily_paper_counts` | Includes only dates containing at least one paper | Implemented |
| Weekly Paper Count | Count of distinct papers for each publication week | `vw_weekly_paper_counts` | Weeks begin Monday and use a real week-start date | Implemented |
| Monthly Paper Count | Count of distinct papers for each calendar month | `vw_monthly_paper_counts` | Uses month-start dates rather than separate year and month fields | Implemented |
| Cumulative Paper Count | Running total of papers by publication date | `vw_cumulative_paper_counts` | Must never decrease and should end at the total number of papers with a publication date | Implemented |

## Topic Metrics

| Metric | Definition | Source | Notes | Status |
|---|---|---|---|---|
| Topic Distribution | Distinct papers associated with each detected topic | `vw_paper_topics` | Percentages use topic-tagged papers as the denominator and may sum above 100% | Implemented |
| Weekly Topic Trend | Distinct papers per topic and publication week | `vw_topic_weekly_trends` | Weeks begin Monday | Implemented |
| 30-Day Topic Growth | Latest 30-day topic count compared with the preceding 30 days | `vw_topic_growth_30d` | Percentage is null when the previous count is zero | Implemented |

## Category Metrics

| Metric | Definition | Source | Notes | Status |
|---|---|---|---|---|
| Category Distribution | Distinct papers associated with each arXiv category | `vw_category_distribution` | Uses all category associations; percentages may sum above 100% | Implemented |
| Primary Category Distribution | Distinct papers grouped by their primary arXiv category | `vw_primary_category_distribution` | Each paper contributes to at most one primary category | Implemented |
| Weekly Category Trend | Distinct papers per category and publication week | `vw_category_weekly_trends` | Uses all category associations; weeks begin Monday | Implemented |
| 30-Day Category Growth | Latest 30-day category count compared with the preceding 30 days | `vw_category_growth_30d` | Percentage is null when the previous count is zero | Implemented |
| Category–Topic Matrix | Distinct papers shared by each category-topic pair | `vw_category_topic_matrix` | A multi-category, multi-topic paper may contribute to several pairs | Implemented |

## Author Metrics

Author names are treated as identity keys within this project. Different
researchers may share the same name, and one researcher may appear under
multiple name variations. These metrics therefore describe activity in the
current warehouse dataset rather than verified real-world author identity.

| Metric | Definition | Source | Notes | Status |
|---|---|---|---|---|
| Author Ranking | Authors ranked by count of distinct associated papers | `vw_author_rankings` | Measures activity in the warehouse, not research quality or citation impact | Implemented |
| Latest Author Publication | Most recent publication date associated with an author | `vw_author_rankings` | Uses `fact_papers.published_date` | Implemented |
| Author Topic Count | Number of distinct detected topics associated with an author | `vw_author_rankings` | One paper may contribute multiple topics | Implemented |
| Author Category Count | Number of distinct arXiv categories associated with an author | `vw_author_rankings` | Uses all category associations | Implemented |
| Author Topic Specialization | Distinct papers for each author-topic pair | `vw_author_topic_specialization` | Only observed author-topic pairs are included | Implemented |
| Average Authors per Paper | Mean number of authors among papers represented in `paper_authors` | `vw_author_statistics` | Papers without author relationships are excluded | Implemented |
| Median Authors per Paper | Median author count among papers represented in `paper_authors` | `vw_author_statistics` | Uses PostgreSQL `percentile_cont(0.5)` | Implemented |
| Maximum Authors per Paper | Largest author count associated with one paper | `vw_author_statistics` | Based on bridge-table relationships | Implemented |
| Single-Author Papers | Papers with exactly one author relationship | `vw_author_statistics` | Counts authored papers only | Implemented |
| Multi-Author Papers | Papers with more than one author relationship | `vw_author_statistics` | Counts authored papers only | Implemented |

## Dashboard Outputs

| Output | Definition | Source | Notes | Status |
|---|---|---|---|---|
| Dashboard KPI Summary | Single record combining publication KPIs, top topic, top category, top author, and latest ETL status | `vw_dashboard_kpis` | Reuses previously validated KPI views | Implemented |
| Latest Papers Feed | One row per paper with aggregated authors, categories, topics, dates, and links | `vw_latest_papers` | Consumers must apply explicit ordering and a result limit | Implemented |

## Dashboard API Contract

### Dashboard Home

Endpoint:

`GET /dashboard/home`

This endpoint combines existing validated analytics outputs for the dashboard
homepage. It does not define new metrics.

| Response section | Source |
|---|---|
| `kpis` | `vw_dashboard_kpis` |
| `daily_trend` | `vw_daily_paper_counts` |
| `weekly_trend` | `vw_weekly_paper_counts` |
| `topic_distribution` | `vw_topic_distribution` |
| `topic_growth` | `vw_topic_growth_30d` |
| `primary_category_distribution` | `vw_primary_category_distribution` |
| `category_growth` | `vw_category_growth_30d` |
| `top_authors` | `vw_author_rankings` |
| `author_statistics` | `vw_author_statistics` |
| `latest_papers` | `vw_latest_papers` |

Optional query parameters:

- `latest_paper_limit`: 1–100, default 10
- `author_limit`: 1–100, default 10