from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import fetch_all

app = FastAPI(title="AI Research Intelligence Copilot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
def metrics():
    total_papers = fetch_all("select count(*) as total_papers from fact_papers;")

    top_topics = fetch_all("""
        select
            dt.topic_name,
            count(*) as paper_count
        from paper_topics pt
        join dim_topic dt on pt.topic_id = dt.topic_id
        group by dt.topic_name
        order by paper_count desc;
    """)

    papers_by_category = fetch_all("""
        select
            primary_category,
            count(*) as paper_count
        from fact_papers
        group by primary_category
        order by paper_count desc;
    """)

    latest_papers = fetch_all("""
        select
            title,
            primary_category,
            published_date,
            arxiv_url
        from fact_papers
        order by published_date desc
        limit 10;
    """)

    return {
        "total_papers": total_papers[0]["total_papers"],
        "top_topics": top_topics,
        "papers_by_category": papers_by_category,
        "latest_papers": latest_papers,
    }


@app.get("/")
def root():
    return {
        "message": "AI Research Intelligence Copilot API",
        "docs": "/docs",
        "health": "/health",
        "metrics": "/metrics",
    }
