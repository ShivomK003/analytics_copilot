-- ============================================================
-- Topic analytics
-- AI Research Intelligence Copilot
-- ============================================================


-- ------------------------------------------------------------
-- 1. Topic distribution
--
-- Grain:
-- One row per detected topic.
--
-- percentage_of_tagged_papers:
-- Percentage of papers with at least one detected topic that
-- are associated with this topic.
--
-- Because papers may have multiple topics, percentages across
-- topics may sum to more than 100%.
-- ------------------------------------------------------------

create or replace view vw_topic_distribution as
with tagged_paper_total as (
    select
        count(distinct paper_id) as total_tagged_papers
    from vw_paper_topics
)

select
    vpt.topic_id,
    vpt.topic_name,
    count(distinct vpt.paper_id) as paper_count,

    round(
        (
            count(distinct vpt.paper_id)::numeric
            / nullif(tpt.total_tagged_papers, 0)
        ) * 100,
        2
    ) as percentage_of_tagged_papers

from vw_paper_topics vpt
cross join tagged_paper_total tpt

group by
    vpt.topic_id,
    vpt.topic_name,
    tpt.total_tagged_papers

order by
    paper_count desc,
    vpt.topic_name asc;


comment on view vw_topic_distribution is
'One row per topic with distinct-paper count and percentage of topic-tagged papers. Percentages may sum above 100% because papers can have multiple topics.';


-- ------------------------------------------------------------
-- 2. Weekly topic trends
--
-- Grain:
-- One row per topic-week combination containing at least one
-- paper.
--
-- week_start uses a real date rather than the integer week
-- column, preventing different years from being combined.
-- ------------------------------------------------------------

create or replace view vw_topic_weekly_trends as
select
    date_trunc(
        'week',
        published_date
    )::date as week_start,

    topic_id,
    topic_name,
    count(distinct paper_id) as paper_count

from vw_paper_topics

where published_date is not null

group by
    date_trunc('week', published_date)::date,
    topic_id,
    topic_name

order by
    week_start,
    paper_count desc,
    topic_name asc;


comment on view vw_topic_weekly_trends is
'Weekly distinct-paper counts by detected topic using Monday as the week-start date.';


-- ------------------------------------------------------------
-- 3. Topic growth: latest 30 days versus previous 30 days
--
-- Current period:
-- current_date - 29 days through current_date, inclusive.
--
-- Previous period:
-- current_date - 59 days through current_date - 30 days,
-- inclusive.
--
-- Grain:
-- One row per topic.
--
-- growth_percentage is null when the previous-period count is
-- zero because percentage growth has no valid baseline.
-- ------------------------------------------------------------

create or replace view vw_topic_growth_30d as
with topic_counts as (
    select
        dt.topic_id,
        dt.topic_name,

        count(
            distinct case
                when fp.published_date::date
                    between current_date - 29
                    and current_date
                then pt.paper_id
            end
        ) as current_30_day_count,

        count(
            distinct case
                when fp.published_date::date
                    between current_date - 59
                    and current_date - 30
                then pt.paper_id
            end
        ) as previous_30_day_count

    from dim_topic dt

    left join paper_topics pt
        on dt.topic_id = pt.topic_id

    left join fact_papers fp
        on pt.paper_id = fp.paper_id

    group by
        dt.topic_id,
        dt.topic_name
)

select
    topic_id,
    topic_name,

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

from topic_counts

order by
    absolute_growth desc,
    current_30_day_count desc,
    topic_name asc;


comment on view vw_topic_growth_30d is
'Topic growth comparing the latest inclusive 30-day period with the preceding 30-day period.';