-- ============================================================
-- Time-series analytical views
-- AI Research Intelligence Copilot
-- ============================================================


-- ------------------------------------------------------------
-- 1. Daily paper counts
--
-- Grain:
-- One row per publication date that contains at least one paper.
-- ------------------------------------------------------------

create or replace view vw_daily_paper_counts as
select
    published_date::date as publication_date,
    count(distinct paper_id) as paper_count
from fact_papers
where published_date is not null
group by published_date::date
order by publication_date;


comment on view vw_daily_paper_counts is
'Daily count of distinct papers grouped by publication date.';


-- ------------------------------------------------------------
-- 2. Weekly paper counts
--
-- Grain:
-- One row per publication week.
--
-- date_trunc is used instead of the integer week column so that
-- the same week number from different years is never combined.
-- PostgreSQL weeks begin on Monday.
-- ------------------------------------------------------------

create or replace view vw_weekly_paper_counts as
select
    date_trunc('week', published_date)::date as week_start,
    count(distinct paper_id) as paper_count
from fact_papers
where published_date is not null
group by date_trunc('week', published_date)::date
order by week_start;


comment on view vw_weekly_paper_counts is
'Weekly count of distinct papers using Monday as the week-start date.';


-- ------------------------------------------------------------
-- 3. Monthly paper counts
--
-- Grain:
-- One row per calendar month.
-- ------------------------------------------------------------

create or replace view vw_monthly_paper_counts as
select
    date_trunc('month', published_date)::date as month_start,
    count(distinct paper_id) as paper_count
from fact_papers
where published_date is not null
group by date_trunc('month', published_date)::date
order by month_start;


comment on view vw_monthly_paper_counts is
'Monthly count of distinct papers grouped by calendar month.';


-- ------------------------------------------------------------
-- 4. Cumulative paper counts
--
-- Grain:
-- One row per publication date.
--
-- papers_published:
-- Number of papers published on that date.
--
-- cumulative_papers:
-- Running total of all papers published up to and including
-- that date.
-- ------------------------------------------------------------

create or replace view vw_cumulative_paper_counts as
select
    publication_date,
    paper_count as papers_published,
    sum(paper_count) over (
        order by publication_date
        rows between unbounded preceding and current row
    ) as cumulative_papers
from vw_daily_paper_counts
order by publication_date;


comment on view vw_cumulative_paper_counts is
'Daily publication counts with a cumulative running total of distinct papers.';