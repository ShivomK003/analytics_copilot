-- ============================================================
-- Base analytical views
-- AI Research Intelligence Copilot
-- ============================================================


-- ------------------------------------------------------------
-- 1. Paper-topic relationships
--
-- Grain:
-- One row per paper-topic relationship.
-- ------------------------------------------------------------

create or replace view vw_paper_topics as
select
    fp.paper_id,
    fp.title,
    fp.published_date,
    fp.primary_category,
    dt.topic_id,
    dt.topic_name
from fact_papers fp
join paper_topics pt
    on fp.paper_id = pt.paper_id
join dim_topic dt
    on pt.topic_id = dt.topic_id;


comment on view vw_paper_topics is
'One row per paper-topic relationship for topic-level analytics.';


-- ------------------------------------------------------------
-- 2. Paper-category relationships
--
-- Grain:
-- One row per paper-category relationship.
-- ------------------------------------------------------------

create or replace view vw_paper_categories as
select
    fp.paper_id,
    fp.title,
    fp.published_date,
    fp.primary_category,
    dc.category_id,
    dc.category_code
from fact_papers fp
join paper_categories pc
    on fp.paper_id = pc.paper_id
join dim_category dc
    on pc.category_id = dc.category_id;


comment on view vw_paper_categories is
'One row per paper-category relationship for category-level analytics.';


-- ------------------------------------------------------------
-- 3. Paper-author relationships
--
-- Grain:
-- One row per paper-author relationship.
-- ------------------------------------------------------------

create or replace view vw_paper_authors as
select
    fp.paper_id,
    fp.title,
    fp.published_date,
    fp.primary_category,
    da.author_id,
    da.author_name
from fact_papers fp
join paper_authors pa
    on fp.paper_id = pa.paper_id
join dim_author da
    on pa.author_id = da.author_id;


comment on view vw_paper_authors is
'One row per paper-author relationship for author-level analytics.';


-- ------------------------------------------------------------
-- 4. Complete paper details
--
-- Grain:
-- Exactly one row per paper.
--
-- Each many-to-many relationship is aggregated separately
-- before being joined to fact_papers. This prevents row
-- multiplication across authors, categories, and topics.
-- ------------------------------------------------------------

create or replace view vw_paper_details as
with author_aggregates as (
    select
        pa.paper_id,
        array_agg(
            distinct da.author_name
            order by da.author_name
        ) as authors,
        count(distinct pa.author_id) as author_count
    from paper_authors pa
    join dim_author da
        on pa.author_id = da.author_id
    group by pa.paper_id
),

category_aggregates as (
    select
        pc.paper_id,
        array_agg(
            distinct dc.category_code
            order by dc.category_code
        ) as categories,
        count(distinct pc.category_id) as category_count
    from paper_categories pc
    join dim_category dc
        on pc.category_id = dc.category_id
    group by pc.paper_id
),

topic_aggregates as (
    select
        pt.paper_id,
        array_agg(
            distinct dt.topic_name
            order by dt.topic_name
        ) as topics,
        count(distinct pt.topic_id) as topic_count
    from paper_topics pt
    join dim_topic dt
        on pt.topic_id = dt.topic_id
    group by pt.paper_id
)

select
    fp.paper_id,
    fp.title,
    fp.abstract,
    fp.primary_category,
    fp.published_date,
    fp.updated_date,
    fp.pdf_url,
    fp.arxiv_url,
    fp.year,
    fp.month,
    fp.week,

    coalesce(
        aa.authors,
        array[]::text[]
    ) as authors,

    coalesce(
        ca.categories,
        array[]::text[]
    ) as categories,

    coalesce(
        ta.topics,
        array[]::text[]
    ) as topics,

    coalesce(
        aa.author_count,
        0
    ) as author_count,

    coalesce(
        ca.category_count,
        0
    ) as category_count,

    coalesce(
        ta.topic_count,
        0
    ) as topic_count

from fact_papers fp
left join author_aggregates aa
    on fp.paper_id = aa.paper_id
left join category_aggregates ca
    on fp.paper_id = ca.paper_id
left join topic_aggregates ta
    on fp.paper_id = ta.paper_id;


comment on view vw_paper_details is
'One row per paper with aggregated authors, categories, topics, and relationship counts.';