import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { TopicDistributionChart } from "../components/charts/TopicDistributionChart";
import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";
import { PageContainer } from "../components/layout/PageContainer";
import { ExecutiveLoading, ExecutivePanel } from "../components/overview/ExecutivePanel";
import { PublicationActivity } from "../components/overview/PublicationActivity";
import { useDashboardHome } from "../hooks/useDashboardHome";
import { useAuthorCount } from "../hooks/useAuthors";
import { useIntelligenceCoverage } from "../hooks/useIntelligence";
import { executiveDate, executiveNumber } from "../utils/executiveData";
import "../styles/overview.css";

export function OverviewPage() {
  const snapshot = useDashboardHome();
  const coverage = useIntelligenceCoverage();
  const authors = useAuthorCount();
  const data = snapshot.data;
  const kpis = data?.kpis;
  const topics = data?.topic_distribution;
  const researchers = data?.top_authors;
  const papers = data?.latest_papers;
  const updatedAt = coverage.data?.data.latest_successful_etl_at;
  const metrics = [
    {
      label: "Indexed papers",
      value: kpis?.total_papers,
      pending: snapshot.isLoading,
      detail: "Stored publications · whole corpus",
    },
    {
      label: "Published this week",
      value: kpis?.papers_published_this_week,
      pending: snapshot.isLoading,
      detail: "Warehouse calendar · in progress",
    },
    {
      label: "Topics tracked",
      value: coverage.data?.data.total_topics,
      pending: coverage.isPending,
      detail: "Configured research topics",
    },
    {
      label: "Researchers indexed",
      value: authors.data?.total,
      pending: authors.isPending,
      detail: "Indexed author records",
    },
  ];

  return (
    <PageContainer>
      <div className="executive-overview">
        <header className="executive-hero" aria-label="AI Research Intelligence">
          <div className="executive-hero-copy">
            <p className="page-eyebrow">AI Research Intelligence</p>
            <h1>
              Discover where <span>AI research</span>
              <br /> is heading.
            </h1>
            <p className="executive-hero-description">
              A clear view of the indexed research landscape,
              <br className="executive-desktop-break" /> from publication activity to leading topics
              and researchers.
            </p>
            <div className="executive-hero-actions">
              <Link to="/intelligence" className="executive-primary-link">
                Explore Research Intelligence <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <p className="executive-freshness">
                {coverage.isPending ? (
                  "Checking warehouse update…"
                ) : updatedAt ? (
                  <>
                    Last successful update:{" "}
                    <time dateTime={updatedAt}>{executiveDate(updatedAt, true)} UTC</time>
                  </>
                ) : (
                  "Successful warehouse update unavailable"
                )}
              </p>
            </div>
          </div>
          <div className="executive-hero-landscape" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </header>

        <section className="executive-canvas" aria-label="Executive dashboard">
          <dl className="executive-kpi-strip">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>
                  <span>{metric.pending ? "Loading…" : executiveNumber(metric.value)}</span>
                  <p>{metric.detail}</p>
                </dd>
              </div>
            ))}
          </dl>
          {snapshot.isFetching && data ? (
            <p className="executive-refresh-note" role="status">
              Updating executive snapshot…
            </p>
          ) : null}
          {snapshot.isError ? (
            <ErrorState
              title={data ? "Snapshot refresh interrupted" : "Executive snapshot unavailable"}
              description={
                data
                  ? "Showing the last successfully fetched snapshot."
                  : "The indexed snapshot could not be loaded. Try again."
              }
              onRetry={() => void snapshot.refetch()}
              retryLabel="Retry executive snapshot"
            />
          ) : null}
          {!snapshot.isLoading && !snapshot.isError && !kpis ? (
            <ErrorState
              title="Snapshot metrics unavailable"
              description="The response did not include warehouse KPI values."
              onRetry={() => void snapshot.refetch()}
            />
          ) : null}
          {coverage.error ? (
            <p className="executive-source-note" role="status">
              Topic coverage and update information could not refresh.{" "}
              <button type="button" onClick={() => void coverage.refetch()}>
                Retry coverage
              </button>
            </p>
          ) : null}
          {authors.error ? (
            <p className="executive-source-note" role="status">
              Researcher coverage could not refresh.{" "}
              <button type="button" onClick={() => void authors.refetch()}>
                Retry researcher count
              </button>
            </p>
          ) : null}
          <div className="executive-dashboard-grid">
            <PublicationActivity
              daily={data?.daily_trend}
              weekly={data?.weekly_trend}
              isLoading={snapshot.isLoading}
              unavailable={snapshot.isError}
            />
            <ExecutivePanel
              title="Topic Distribution"
              description="Leading topics by indexed paper count"
              className="executive-topics"
            >
              {snapshot.isLoading ? (
                <ExecutiveLoading label="Loading topic distribution…" />
              ) : topics ? (
                <>
                  <TopicDistributionChart data={topics} compact />
                  <details className="executive-data-disclosure">
                    <summary>Topic values</summary>
                    <ul className="executive-topic-values">
                      {[...topics]
                        .sort((a, b) => b.paper_count - a.paper_count)
                        .slice(0, 8)
                        .map((topic) => (
                          <li key={topic.topic_id}>
                            <span>{topic.topic_name}</span>
                            <strong>{executiveNumber(topic.paper_count)}</strong>
                          </li>
                        ))}
                    </ul>
                  </details>
                </>
              ) : (
                <p className="executive-panel-note">Topic distribution is unavailable.</p>
              )}
            </ExecutivePanel>
            <ExecutivePanel
              title="Leading Researchers"
              description="Top author records by indexed publications"
              className="executive-researchers"
            >
              {snapshot.isLoading ? (
                <ExecutiveLoading label="Loading leading researchers…" />
              ) : !researchers ? (
                <p className="executive-panel-note">Researcher rankings are unavailable.</p>
              ) : researchers.length ? (
                <ol className="executive-researcher-list">
                  {researchers.slice(0, 5).map((author, index) => (
                    <li key={author.author_id}>
                      <span className="executive-rank" aria-hidden="true">
                        {index + 1}
                      </span>
                      <Link to={`/authors/${author.author_id}`}>{author.author_name}</Link>
                      <span>
                        {executiveNumber(author.paper_count)} <small>papers</small>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No researchers available"
                  description="Researcher rankings will appear when indexed author records are available."
                />
              )}
            </ExecutivePanel>
            <ExecutivePanel
              title="Recent Publications"
              description="Latest publication dates in the indexed corpus"
              className="executive-publications"
              action={
                <Link className="executive-text-link" to="/papers">
                  View all papers <ArrowRight size={15} aria-hidden="true" />
                </Link>
              }
            >
              {snapshot.isLoading ? (
                <ExecutiveLoading label="Loading recent publications…" />
              ) : !papers ? (
                <p className="executive-panel-note">Recent publications are unavailable.</p>
              ) : papers.length ? (
                <ul className="executive-publication-list">
                  {papers.slice(0, 5).map((paper) => (
                    <li key={paper.paper_id}>
                      <div>
                        <Link
                          className="executive-paper-title"
                          to={`/papers/${encodeURIComponent(paper.paper_id)}`}
                        >
                          {paper.title ?? "Untitled publication"}
                        </Link>
                        <p>
                          {paper.authors?.slice(0, 2).join(", ") || "Authors unavailable"}
                          <span aria-hidden="true"> · </span>
                          {paper.primary_category ?? "Uncategorized"}
                          <span aria-hidden="true"> · </span>
                          <time dateTime={paper.published_date ?? undefined}>
                            {executiveDate(paper.published_date)}
                          </time>
                        </p>
                      </div>
                      {paper.topics?.[0] ? (
                        <span className="executive-topic-tag">{paper.topics[0]}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No recent publications"
                  description="Recent publications will appear when records are indexed."
                />
              )}
            </ExecutivePanel>
          </div>
          <details className="executive-methodology">
            <summary>About this snapshot · historical completeness unverified</summary>
            <div className="disclosure-content">
              <p>
                Metrics describe the currently indexed corpus, not all AI research. Topic
                assignments overlap and may contain classification noise. Author records are not a
                verified census of unique researchers.
              </p>
              <p>
                Publication charts retain the warehouse's daily, Monday-based weekly and monthly
                aggregates. Dates and timestamps are displayed in UTC; aggregation cutoffs follow
                the existing warehouse views. In-progress periods may grow, and past calendar
                periods do not establish complete ingestion. Missing periods and unavailable counts
                are never filled with zero.
              </p>
              <p>
                The warehouse update is the last successful ETL completion, separate from
                publication dates. Panel sources can refresh independently and do not promise a
                single database snapshot.
              </p>
              {coverage.data?.meta.warnings.length ? (
                <ul>
                  {coverage.data.meta.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </section>
      </div>
    </PageContainer>
  );
}
