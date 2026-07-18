import {
  Activity,
  BookOpenText,
  FileStack,
  Radar,
  UsersRound,
} from "lucide-react";
import { TopicDistributionChart } from "../components/charts/TopicDistributionChart";
import { WeeklyTrendChart } from "../components/charts/WeeklyTrendChart";
import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";
import { PageSkeleton } from "../components/feedback/PageSkeleton";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { ResponsiveGrid } from "../components/layout/ResponsiveGrid";
import { Card } from "../components/ui/Card";
import { useDashboardHome } from "../hooks/useDashboardHome";
import type { LatestPaperItem } from "../types/dashboard";

const PAGE_TITLE = "Overview";
const PAGE_DESCRIPTION =
  "A clear read on publication volume, topic movement, and author momentum across the AI research landscape.";

export function OverviewPage() {
  const { data, error, isError, isFetching, isLoading, refetch } = useDashboardHome();

  if (isLoading && !data) {
    return (
      <PageContainer>
        <PageSkeleton title="Loading overview" />
      </PageContainer>
    );
  }

  if (isError && !data) {
    return (
      <PageContainer>
        <PageHeader description={PAGE_DESCRIPTION} title={PAGE_TITLE} />
        <ErrorState
          description={getErrorDescription(error)}
          onRetry={() => {
            void refetch();
          }}
          retryLabel="Retry overview fetch"
          title="Overview data is unavailable right now"
        />
      </PageContainer>
    );
  }

  if (!data || !data.kpis) {
    return (
      <PageContainer>
        <PageHeader description={PAGE_DESCRIPTION} title={PAGE_TITLE} />
        <ErrorState
          description="The dashboard response did not include the overview KPI payload."
          onRetry={() => {
            void refetch();
          }}
          retryLabel="Retry overview fetch"
          title="Overview data is incomplete"
        />
      </PageContainer>
    );
  }

  const kpis = data.kpis;
  const weeklyTrend = data.weekly_trend ?? [];
  const topicDistribution = data.topic_distribution ?? [];
  const topAuthors = data.top_authors ?? [];
  const latestPapers = data.latest_papers ?? [];

  const leadingAuthors = topAuthors.slice(0, 5);
  const recentPapers = latestPapers.slice(0, 5);

  return (
    <PageContainer>
      <PageHeader
        action={
          isFetching ? (
            <span className="status-pill status-pill-muted">Refreshing live data</span>
          ) : undefined
        }
        description={PAGE_DESCRIPTION}
        title={PAGE_TITLE}
      />

      <section className="overview-hero" aria-label="AI Research Activity">
        <div className="overview-hero-copy">
          <p className="page-eyebrow">Daily intelligence snapshot</p>
          <h2>AI Research Activity</h2>
          <div className="overview-hero-metrics">
            <p className="overview-hero-primary">
              {formatNumber(kpis?.total_papers ?? 0)} papers tracked
            </p>
            <div className="overview-hero-secondary">
              <span>
                {formatNumber(kpis?.papers_published_this_week ?? 0)} published this week
              </span>
              <span className="overview-hero-growth">
                {formatNumber(kpis?.papers_published_this_month ?? 0)} this month
              </span>
            </div>
          </div>
          <div className="overview-hero-chips">
            <span className="overview-hero-chip">
              Topics detected: {formatNumber(topicDistribution.length ?? 0)}
            </span>
            <span className="overview-hero-chip">
              Updated {kpis?.latest_etl_status?.toLowerCase() ?? "via pipeline"}
            </span>
            <span className="overview-hero-chip">
              Top authors tracked: {formatNumber(topAuthors.length ?? 0)}
            </span>
          </div>
        </div>
        <div className="overview-hero-visual" aria-hidden="true">
          <div className="hero-visual-panel">
            <div className="hero-bars">
              {buildHeroHeights(weeklyTrend, 4).map((height, index) => (
                <span key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="hero-orbit" />
            <div className="hero-grid">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </section>

      <PageSection
        description="Headline indicators now read directly from the dashboard analytics endpoint."
        eyebrow="Core metrics"
        title="KPI Summary"
      >
        <ResponsiveGrid variant="compact">
          <Card
            description="Warehouse total"
            eyebrow="Live metric"
            icon={<Activity size={18} />}
            title="Research volume"
            tone="accent"
          >
            <div className="overview-stat">
              <strong>{formatNumber(kpis?.total_papers ?? 0)}</strong>
              <span>
                {formatNumber(kpis?.papers_published_this_week ?? 0)} this week and{" "}
                {formatNumber(kpis?.papers_published_this_month ?? 0)} this month
              </span>
            </div>
          </Card>
          <Card
            description="Top detected topic"
            eyebrow="Live metric"
            icon={<Radar size={18} />}
            title="Topic breadth"
            tone="info"
          >
            <div className="overview-stat">
              <strong>{kpis?.top_topic_name ?? "--"}</strong>
              <span>
                {formatNumber(kpis?.top_topic_paper_count ?? 0)} papers linked to the leading topic
              </span>
            </div>
          </Card>
          <Card
            description="Most active author"
            eyebrow="Live metric"
            icon={<UsersRound size={18} />}
            title="Author activity"
            tone="success"
          >
            <div className="overview-stat">
              <strong>{kpis?.top_author_name ?? "--"}</strong>
              <span>
                {formatNumber(kpis?.top_author_paper_count ?? 0)} papers across the current warehouse
              </span>
            </div>
          </Card>
          <Card
            description="Leading category"
            eyebrow="Live metric"
            icon={<FileStack size={18} />}
            title="Category mix"
            tone="warning"
          >
            <div className="overview-stat">
              <strong>{kpis?.top_category_code ?? "--"}</strong>
              <span>
                {formatNumber(kpis?.top_category_paper_count ?? 0)} papers in the strongest category
              </span>
            </div>
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        description="Weekly publication counts stay visible during background refreshes and are ready for chart binding."
        eyebrow="Research flow"
        title="Publication Activity"
      >
        <ResponsiveGrid variant="wide">
          <Card
            description="Weekly paper counts"
            eyebrow="Connected chart"
            icon={<Activity size={18} />}
            title="Weekly publication trend"
            tone="accent"
          >
            <WeeklyTrendChart data={weeklyTrend} />
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        description="Topic distribution is visualized using the leading detected topics from the connected overview dataset."
        eyebrow="Signals"
        title="Topic Distribution"
      >
        <ResponsiveGrid variant="standard">
          <Card
            description="Top 8 topics by paper count"
            eyebrow="Connected chart"
            icon={<Radar size={18} />}
            title="Topic distribution"
            tone="accent"
          >
            <TopicDistributionChart data={topicDistribution} />
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        description="Author rankings stay focused on the most active contributors in the current warehouse snapshot."
        eyebrow="Leaders"
        title="Top Authors"
      >
        <ResponsiveGrid variant="standard">
          <Card
            description="Top author rankings"
            eyebrow="Connected list"
            icon={<UsersRound size={18} />}
            title="Top authors"
            tone="success"
          >
            {leadingAuthors.length > 0 ? (
              <ul className="overview-list">
                {leadingAuthors.map((author) => (
                  <li key={author.author_id}>
                    <span>{author.author_name ?? "--"}</span>
                    <strong>{formatNumber(author.paper_count ?? 0)} papers</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                description="Author rankings will appear here once author activity data is available."
                title="No authors found"
              />
            )}
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        description="The latest papers feed now binds to the backend home response."
        eyebrow="Discovery"
        title="Latest Papers"
      >
        <ResponsiveGrid variant="wide">
          <Card
            description="Recent papers from the warehouse feed"
            eyebrow="Connected feed"
            icon={<BookOpenText size={18} />}
            title="Recent paper feed"
            tone="accent"
          >
            {recentPapers.length > 0 ? (
              <ul className="overview-paper-list">
                {recentPapers.map((paper) => (
                  <li key={paper.paper_id}>
                    <div>
                      <strong>{paper.title ?? "Untitled paper"}</strong>
                      <span>
                        {paper.primary_category ?? "Uncategorized"} · {formatDate(paper.published_date)}
                      </span>
                    </div>
                    <p>{summarizePaper(paper)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                description="Recent papers will appear here once the backend feed returns results."
                title="No recent papers available"
              />
            )}
          </Card>
        </ResponsiveGrid>
      </PageSection>
    </PageContainer>
  );
}

function buildHeroHeights(
  points: Array<{ paper_count: number | null | undefined }>,
  maxBars: number,
): number[] {
  const selectedPoints = points.slice(-maxBars);

  if (selectedPoints.length === 0) {
    return Array.from({ length: maxBars }, () => 28);
  }

  const maximumCount = Math.max(
    ...selectedPoints.map((point) => point.paper_count ?? 0),
    1,
  );

  return selectedPoints.map((point) =>
    Math.max(24, Math.round(((point.paper_count ?? 0) / maximumCount) * 100)),
  );
}

function summarizePaper(paper: LatestPaperItem): string {
  const authorsLabel =
    (paper.authors?.length ?? 0) > 0
      ? paper.authors.slice(0, 2).join(", ")
      : "Author metadata pending";
  const topicsLabel =
    (paper.topics?.length ?? 0) > 0
      ? paper.topics.slice(0, 2).join(", ")
      : "Topic enrichment pending";

  return `${authorsLabel} · ${topicsLabel}`;
}

function getErrorDescription(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "The dashboard home endpoint could not be loaded.";
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
