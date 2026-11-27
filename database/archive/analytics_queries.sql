-- 1. Total papers
select count(*) as total_papers
from fact_papers;

-- 2. Papers by primary category
select
    primary_category,
    count(*) as paper_count
from fact_papers
group by primary_category
order by paper_count desc;

-- 3. Top detected topics
select
    dt.topic_name,
    count(*) as paper_count
from paper_topics pt
join dim_topic dt on pt.topic_id = dt.topic_id
group by dt.topic_name
order by paper_count desc;

-- 4. Papers over time by day
select
    date(published_date) as published_day,
    count(*) as paper_count
from fact_papers
group by published_day
order by published_day;

-- 5. Top authors
select
    da.author_name,
    count(*) as paper_count
from paper_authors pa
join dim_author da on pa.author_id = da.author_id
group by da.author_name
order by paper_count desc
limit 10;

-- 6. Topic trend by day
select
    date(fp.published_date) as published_day,
    dt.topic_name,
    count(*) as paper_count
from fact_papers fp
join paper_topics pt on fp.paper_id = pt.paper_id
join dim_topic dt on pt.topic_id = dt.topic_id
group by published_day, dt.topic_name
order by published_day, paper_count desc;

-- 7. Latest papers
select
    title,
    primary_category,
    published_date,
    arxiv_url
from fact_papers
order by published_date desc
limit 10;