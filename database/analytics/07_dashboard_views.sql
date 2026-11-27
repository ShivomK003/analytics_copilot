-- ============================================================
-- Dashboard-ready analytical views
-- AI Research Intelligence Copilot
-- ============================================================


-- ------------------------------------------------------------
-- 1. Dashboard KPI summary
--
-- Grain:
-- Exactly one row.
--
-- Combines the individual KPI views into one dashboard-ready
-- record. Scalar subqueries ensure the view still returns one
-- row even if a ranking or ETL view contains no data.
-- ------------------------------------------------------------

create or replace view vw_dashboard_kpis as
select
    (
        select total_papers
        from vw_total_papers
    ) as total_papers,

    (
        select papers_published_today
        from vw_papers_published_today
    ) as papers_published_today,

    (
        select papers_published_this_week
        from vw_papers_published_this_week
    ) as papers_published_this_week,

    (
        select papers_published_this_month
        from vw_papers_published_this_month
    ) as papers_published_this_month,

    (
        select topic_id
        from vw_top_topic
    ) as top_topic_id,

    (
        select topic_name
        from vw_top_topic
    ) as top_topic_name,

    (
        select paper_count
        from vw_top_topic
    ) as top_topic_paper_count,

    (
        select category_id
        from vw_top_category
    ) as top_category_id,

    (
        select category_code
        from vw_top_category
    ) as top_category_code,

    (
        select paper_count
        from vw_top_category
    ) as top_category_paper_count,

    (
        select author_id
        from vw_top_author
    ) as top_author_id,

    (
        select author_name
        from vw_top_author
    ) as top_author_name,

    (
        select paper_count
        from vw_top_author
    ) as top_author_paper_count,

    (
        select run_id
        from vw_latest_etl_run
    ) as latest_etl_run_id,

    (
        select status
        from vw_latest_etl_run
    ) as latest_etl_status,

    (
        select start_time
        from vw_latest_etl_run
    ) as latest_etl_start_time,

    (
        select end_time
        from vw_latest_etl_run
    ) as latest_etl_end_time,

    (
        select new_papers_loaded
        from vw_latest_etl_run
    ) as latest_etl_new_papers_loaded,

    (
        select duplicates_skipped
        from vw_latest_etl_run
    ) as latest_etl_duplicates_skipped,

    (
        select duration_seconds
        from vw_latest_etl_run
    ) as latest_etl_duration_seconds;


comment on view vw_dashboard_kpis is
'Single-row dashboard summary combining publication KPIs, top topic, top category, top author, and latest ETL information.';


-- ------------------------------------------------------------
-- 2. Latest-papers dataset
--
-- Grain:
-- Exactly one row per paper.
--
-- This view does not contain LIMIT because the API or dashboard
-- must choose how many papers to request.
--
-- PostgreSQL does not guarantee view ordering. Consumers must
-- explicitly order by published_date and paper_id.
-- ------------------------------------------------------------

create or replace view vw_latest_papers as
select
    paper_id,
    title,
    abstract,
    authors,
    primary_category,
    categories,
    topics,
    published_date,
    updated_date,
    pdf_url,
    arxiv_url,
    author_count,
    category_count,
    topic_count
from vw_paper_details;


comment on view vw_latest_papers is
'Dashboard-ready paper feed with aggregated authors, categories, topics, publication dates, and links.';