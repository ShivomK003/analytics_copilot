drop table if exists paper_topics;
drop table if exists paper_categories;
drop table if exists paper_authors;
drop table if exists dim_topic;
drop table if exists dim_category;
drop table if exists dim_author;
drop table if exists fact_papers;


create table fact_papers (
    paper_id text primary key,
    title text not null,
    abstract text,
    primary_category text,
    published_date timestamptz,
    updated_date timestamptz,
    pdf_url text,
    arxiv_url text,
    year int,
    month int,
    week int
);

create table dim_author (
    author_id int primary key,
    author_name text not null unique
);

create table dim_category (
    category_id int primary key,
    category_code text not null unique
);

create table dim_topic (
    topic_id int primary key,
    topic_name text not null unique
);

create table paper_authors (
    paper_id text references fact_papers(paper_id) on delete cascade,
    author_id int references dim_author(author_id) on delete cascade,
    primary key (paper_id, author_id)
);

create table paper_categories (
    paper_id text references fact_papers(paper_id) on delete cascade,
    category_id int references dim_category(category_id) on delete cascade,
    primary key (paper_id, category_id)
);

create table paper_topics (
    paper_id text references fact_papers(paper_id) on delete cascade,
    topic_id int references dim_topic(topic_id) on delete cascade,
    primary key (paper_id, topic_id)
);

create index idx_fact_papers_published_date on fact_papers(published_date);
create index idx_fact_papers_primary_category on fact_papers(primary_category);
create index idx_dim_topic_name on dim_topic(topic_name);
create index idx_dim_category_code on dim_category(category_code);