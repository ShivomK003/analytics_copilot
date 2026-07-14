-- ============================================================
-- Author analytics
-- AI Research Intelligence Copilot
-- ============================================================


-- ------------------------------------------------------------
-- 1. Author rankings
--
-- Grain:
-- One row per author.
--
-- Measures:
-- • distinct papers
-- • latest publication
-- • distinct topics
-- • distinct categories
-- ------------------------------------------------------------

create or replace view vw_author_rankings as
select
    da.author_id,
    da.author_name,

    count(distinct pa.paper_id) as paper_count,

    max(fp.published_date) as latest_publication_date,

    count(distinct pt.topic_id) as distinct_topic_count,

    count(distinct pc.category_id) as distinct_category_count

from dim_author da

left join paper_authors pa
    on da.author_id = pa.author_id

left join fact_papers fp
    on pa.paper_id = fp.paper_id

left join paper_topics pt
    on pa.paper_id = pt.paper_id

left join paper_categories pc
    on pa.paper_id = pc.paper_id

group by
    da.author_id,
    da.author_name

order by
    paper_count desc,
    da.author_name asc;


comment on view vw_author_rankings is
'One row per author with publication counts, latest publication date, and distinct topic/category counts.';


-- ------------------------------------------------------------
-- 2. Author-topic specialization
--
-- Grain:
-- One row per author-topic pair.
-- ------------------------------------------------------------

create or replace view vw_author_topic_specialization as
select
    da.author_id,
    da.author_name,

    dt.topic_id,
    dt.topic_name,

    count(distinct pa.paper_id) as paper_count

from paper_authors pa

join dim_author da
    on pa.author_id = da.author_id

join paper_topics pt
    on pa.paper_id = pt.paper_id

join dim_topic dt
    on pt.topic_id = dt.topic_id

group by
    da.author_id,
    da.author_name,
    dt.topic_id,
    dt.topic_name

order by
    paper_count desc,
    da.author_name,
    dt.topic_name;


comment on view vw_author_topic_specialization is
'Distinct paper counts for every author-topic combination.';


-- ------------------------------------------------------------
-- 3. Collaboration statistics
--
-- Exactly one row.
-- ------------------------------------------------------------

create or replace view vw_author_statistics as
with author_counts as (
    select
        paper_id,
        count(*) as author_count
    from paper_authors
    group by paper_id
),

median_calc as (
    select
        percentile_cont(0.5)
        within group (order by author_count)
        as median_authors_per_paper
    from author_counts
)

select
    round(
        avg(ac.author_count)::numeric,
        2
    ) as average_authors_per_paper,

    max(mc.median_authors_per_paper)
        as median_authors_per_paper,

    max(ac.author_count)
        as maximum_authors_per_paper,

    count(*) filter (
        where ac.author_count = 1
    ) as single_author_papers,

    count(*) filter (
        where ac.author_count > 1
    ) as multi_author_papers

from author_counts ac
cross join median_calc mc;

comment on view vw_author_statistics is
'Single-row collaboration statistics calculated from paper_authors.';