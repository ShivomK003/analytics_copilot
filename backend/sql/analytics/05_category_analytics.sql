-- ============================================================
-- Category analytics
-- AI Research Intelligence Copilot
-- ============================================================


-- ------------------------------------------------------------
-- 1. All-category distribution
--
-- Grain:
-- One row per category in dim_category.
--
-- paper_count:
-- Distinct papers associated with the category through
-- paper_categories.
--
-- percentage_of_categorized_papers:
-- Percentage of papers with at least one category association
-- that are associated with this category.
--
-- Percentages may sum above 100% because one paper can have
-- multiple categories.
-- ------------------------------------------------------------

create or replace view vw_category_distribution as
with categorized_paper_total as (
    select
        count(distinct paper_id) as total_categorized_papers
    from vw_paper_categories
),

category_counts as (
    select
        dc.category_id,
        dc.category_code,
        count(distinct vpc.paper_id) as paper_count
    from dim_category dc
    left join vw_paper_categories vpc
        on dc.category_id = vpc.category_id
    group by
        dc.category_id,
        dc.category_code
)

select
    cc.category_id,
    cc.category_code,
    cc.paper_count,

    round(
        (
            cc.paper_count::numeric
            / nullif(cpt.total_categorized_papers, 0)
        ) * 100,
        2
    ) as percentage_of_categorized_papers

from category_counts cc
cross join categorized_paper_total cpt

order by
    cc.paper_count desc,
    cc.category_code asc;


comment on view vw_category_distribution is
'One row per arXiv category with distinct-paper count and percentage of categorized papers. Percentages may sum above 100% because papers can have multiple categories.';


-- ------------------------------------------------------------
-- 2. Primary-category distribution
--
-- Grain:
-- One row per primary category present in fact_papers.
--
-- This answers a different question from
-- vw_category_distribution.
--
-- vw_category_distribution:
-- All category associations.
--
-- vw_primary_category_distribution:
-- Only the category designated as primary by arXiv.
-- ------------------------------------------------------------

create or replace view vw_primary_category_distribution as
with total_papers_with_primary_category as (
    select
        count(distinct paper_id) as total_papers
    from fact_papers
    where primary_category is not null
)

select
    fp.primary_category as category_code,
    count(distinct fp.paper_id) as paper_count,

    round(
        (
            count(distinct fp.paper_id)::numeric
            / nullif(tppc.total_papers, 0)
        ) * 100,
        2
    ) as percentage_of_primary_categorized_papers

from fact_papers fp
cross join total_papers_with_primary_category tppc

where fp.primary_category is not null

group by
    fp.primary_category,
    tppc.total_papers

order by
    paper_count desc,
    fp.primary_category asc;


comment on view vw_primary_category_distribution is
'Distribution of papers by the primary arXiv category stored in fact_papers.';


-- ------------------------------------------------------------
-- 3. Weekly category trends
--
-- Grain:
-- One row per category-week combination containing at least
-- one paper.
--
-- Uses all category associations from vw_paper_categories.
-- ------------------------------------------------------------

create or replace view vw_category_weekly_trends as
select
    date_trunc(
        'week',
        published_date
    )::date as week_start,

    category_id,
    category_code,
    count(distinct paper_id) as paper_count

from vw_paper_categories

where published_date is not null

group by
    date_trunc('week', published_date)::date,
    category_id,
    category_code

order by
    week_start,
    paper_count desc,
    category_code asc;


comment on view vw_category_weekly_trends is
'Weekly distinct-paper counts by all arXiv category associations, using Monday as the week-start date.';


-- ------------------------------------------------------------
-- 4. Category growth: latest 30 days versus previous 30 days
--
-- Current period:
-- current_date - 29 days through current_date.
--
-- Previous period:
-- current_date - 59 days through current_date - 30 days.
--
-- Grain:
-- One row per category in dim_category.
--
-- growth_percentage is null when the previous-period count is
-- zero because there is no valid percentage baseline.
-- ------------------------------------------------------------

create or replace view vw_category_growth_30d as
with category_counts as (
    select
        dc.category_id,
        dc.category_code,

        count(
            distinct case
                when fp.published_date::date
                    between current_date - 29
                    and current_date
                then pc.paper_id
            end
        ) as current_30_day_count,

        count(
            distinct case
                when fp.published_date::date
                    between current_date - 59
                    and current_date - 30
                then pc.paper_id
            end
        ) as previous_30_day_count

    from dim_category dc

    left join paper_categories pc
        on dc.category_id = pc.category_id

    left join fact_papers fp
        on pc.paper_id = fp.paper_id

    group by
        dc.category_id,
        dc.category_code
)

select
    category_id,
    category_code,

    current_date - 29 as current_period_start,
    current_date as current_period_end,

    current_date - 59 as previous_period_start,
    current_date - 30 as previous_period_end,

    current_30_day_count,
    previous_30_day_count,

    current_30_day_count
        - previous_30_day_count as absolute_growth,

    case
        when previous_30_day_count = 0 then null
        else round(
            (
                (
                    current_30_day_count
                    - previous_30_day_count
                )::numeric
                / previous_30_day_count
            ) * 100,
            2
        )
    end as growth_percentage,

    case
        when previous_30_day_count = 0
             and current_30_day_count > 0
            then 'new'

        when current_30_day_count > previous_30_day_count
            then 'growing'

        when current_30_day_count < previous_30_day_count
            then 'declining'

        else 'stable'
    end as growth_status

from category_counts

order by
    absolute_growth desc,
    current_30_day_count desc,
    category_code asc;


comment on view vw_category_growth_30d is
'Category growth comparing the latest inclusive 30-day period with the preceding 30-day period.';


-- ------------------------------------------------------------
-- 5. Category-topic matrix
--
-- Grain:
-- One row per category-topic pair that shares at least one
-- paper.
--
-- This view joins paper_categories and paper_topics through
-- paper_id.
--
-- A paper is counted once for each category-topic pair.
-- ------------------------------------------------------------

create or replace view vw_category_topic_matrix as
select
    dc.category_id,
    dc.category_code,
    dt.topic_id,
    dt.topic_name,
    count(distinct pc.paper_id) as shared_paper_count

from paper_categories pc

join dim_category dc
    on pc.category_id = dc.category_id

join paper_topics pt
    on pc.paper_id = pt.paper_id

join dim_topic dt
    on pt.topic_id = dt.topic_id

group by
    dc.category_id,
    dc.category_code,
    dt.topic_id,
    dt.topic_name

order by
    shared_paper_count desc,
    dc.category_code asc,
    dt.topic_name asc;


comment on view vw_category_topic_matrix is
'Distinct-paper counts for each observed arXiv category and detected-topic combination.';