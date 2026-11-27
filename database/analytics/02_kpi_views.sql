-- ============================================================
-- Core KPI views
-- AI Research Intelligence Copilot
-- ============================================================


-- ------------------------------------------------------------
-- 1. Total papers
--
-- Definition:
-- Count of distinct papers currently stored in the warehouse.
--
-- Grain:
-- Exactly one row.
-- ------------------------------------------------------------

create or replace view vw_total_papers as
select
    count(distinct paper_id) as total_papers
from fact_papers;


comment on view vw_total_papers is
'One-row KPI containing the total number of distinct papers in the warehouse.';


-- ------------------------------------------------------------
-- 2. Papers published today
--
-- Definition:
-- Papers whose arXiv publication date is the current database
-- date.
--
-- This does not mean papers loaded by the ETL today.
--
-- Grain:
-- Exactly one row.
-- ------------------------------------------------------------

create or replace view vw_papers_published_today as
select
    count(distinct paper_id) as papers_published_today
from fact_papers
where published_date::date = current_date;


comment on view vw_papers_published_today is
'One-row KPI containing papers whose published_date is the current database date.';


-- ------------------------------------------------------------
-- 3. Papers published this week
--
-- PostgreSQL weeks begin on Monday when using date_trunc.
--
-- Grain:
-- Exactly one row.
-- ------------------------------------------------------------

create or replace view vw_papers_published_this_week as
select
    count(distinct paper_id) as papers_published_this_week
from fact_papers
where published_date >= date_trunc('week', current_date);


comment on view vw_papers_published_this_week is
'One-row KPI containing papers published since the beginning of the current PostgreSQL week.';


-- ------------------------------------------------------------
-- 4. Papers published this month
--
-- Grain:
-- Exactly one row.
-- ------------------------------------------------------------

create or replace view vw_papers_published_this_month as
select
    count(distinct paper_id) as papers_published_this_month
from fact_papers
where published_date >= date_trunc('month', current_date);


comment on view vw_papers_published_this_month is
'One-row KPI containing papers published since the beginning of the current calendar month.';


-- ------------------------------------------------------------
-- 5. Top detected topic
--
-- Definition:
-- Topic associated with the largest number of distinct papers.
--
-- Tie-breaking:
-- Alphabetical topic name for deterministic output.
--
-- Grain:
-- Zero or one row.
-- ------------------------------------------------------------

create or replace view vw_top_topic as
select
    topic_id,
    topic_name,
    count(distinct paper_id) as paper_count
from vw_paper_topics
group by
    topic_id,
    topic_name
order by
    paper_count desc,
    topic_name asc
limit 1;


comment on view vw_top_topic is
'The detected topic associated with the greatest number of distinct papers.';


-- ------------------------------------------------------------
-- 6. Top category
--
-- Definition:
-- Category associated with the largest number of distinct
-- papers across all paper-category relationships.
--
-- This is not restricted to primary_category.
--
-- Tie-breaking:
-- Alphabetical category code.
--
-- Grain:
-- Zero or one row.
-- ------------------------------------------------------------

create or replace view vw_top_category as
select
    category_id,
    category_code,
    count(distinct paper_id) as paper_count
from vw_paper_categories
group by
    category_id,
    category_code
order by
    paper_count desc,
    category_code asc
limit 1;


comment on view vw_top_category is
'The arXiv category associated with the greatest number of distinct papers across all category relationships.';


-- ------------------------------------------------------------
-- 7. Top author
--
-- Definition:
-- Author associated with the largest number of distinct papers
-- in the warehouse.
--
-- This measures activity in this dataset. It does not represent
-- author quality, citation impact, or definitive real-world
-- identity.
--
-- Tie-breaking:
-- Alphabetical author name.
--
-- Grain:
-- Zero or one row.
-- ------------------------------------------------------------

create or replace view vw_top_author as
select
    author_id,
    author_name,
    count(distinct paper_id) as paper_count
from vw_paper_authors
group by
    author_id,
    author_name
order by
    paper_count desc,
    author_name asc
limit 1;


comment on view vw_top_author is
'The author associated with the greatest number of distinct papers in the current warehouse dataset.';


-- ------------------------------------------------------------
-- 8. Latest ETL run
--
-- Definition:
-- Most recently started ETL execution recorded in etl_runs.
--
-- Grain:
-- Zero or one row.
-- ------------------------------------------------------------

create or replace view vw_latest_etl_run as
select
    run_id,
    start_time,
    end_time,
    papers_fetched,
    new_papers_loaded,
    duplicates_skipped,
    status,
    duration_seconds
from etl_runs
order by
    start_time desc,
    run_id desc
limit 1;


comment on view vw_latest_etl_run is
'The most recently started ETL execution recorded in etl_runs.';