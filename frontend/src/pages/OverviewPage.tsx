import {
  Activity,
  BookOpenText,
  ChartColumnIncreasing,
  FileStack,
  Lightbulb,
  Radar,
  UsersRound,
} from "lucide-react";
import { ErrorState } from "../components/feedback/ErrorState";
import { PageSkeleton } from "../components/feedback/PageSkeleton";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { ResponsiveGrid } from "../components/layout/ResponsiveGrid";
import { Card } from "../components/ui/Card";
import { useDashboardHome } from "../hooks/useDashboardHome";
import type {
  LatestPaperItem,
  TopicGrowthItem,
  WeeklyTrendPoint,
} from "../types/dashboard";

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

  if (!data) {
    return null;
  }

  const latestWeek = data.weekly_trend.at(-1);
  const leadingTopics = data.topic_distribution.slice(0, 5);
  const leadingTopicGrowth = data.topic_growth.slice(0, 3);
  const leadingCategories = data.primary_category_distribution.slice(0, 4);
  const leadingAuthors = data.top_authors.slice(0, 5);
  const latestPapers = data.latest_papers.slice(0, 5);
  const leadingCategoryGrowth = data.category_growth[0];

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
              {formatNumber(data.kpis.total_papers)} papers tracked
            </p>
            <div className="overview-hero-secondary">
              <span>
                {formatNumber(data.kpis.papers_published_this_week)} published this week
              </span>
              <span className="overview-hero-growth">
                {formatNumber(data.kpis.papers_published_this_month)} this month
              </span>
            </div>
          </div>
          <div className="overview-hero-chips">
            <span className="overview-hero-chip">
              Tracking {formatNumber(data.primary_category_distribution.length)} AI domains
            </span>
            <span className="overview-hero-chip">
              Updated {data.kpis.latest_etl_status?.toLowerCase() ?? "via pipeline"}
            </span>
            <span className="overview-hero-chip">
              Topics detected: {formatNumber(data.topic_distribution.length)}
            </span>
          </div>
        </div>
        <div className="overview-hero-visual" aria-hidden="true">
          <div className="hero-visual-panel">
            <div className="hero-bars">
              {buildTrendHeights(data.weekly_trend, 4).map((height, index) => (
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
              <strong>{formatNumber(data.kpis.total_papers)}</strong>
              <span>
                {formatNumber(data.kpis.papers_published_this_week)} this week and{" "}
                {formatNumber(data.kpis.papers_published_this_month)} this month
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
              <strong>{data.kpis.top_topic_name ?? "No topic data yet"}</strong>
              <span>
                {formatNumber(data.kpis.top_topic_paper_count)} papers linked to the leading topic
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
              <strong>{data.kpis.top_author_name ?? "No author data yet"}</strong>
              <span>
                {formatNumber(data.kpis.top_author_paper_count)} papers across the current warehouse
              </span>
            </div>
          </Card>
          <Card
            description="Leading primary category"
            eyebrow="Live metric"
            icon={<FileStack size={18} />}
            title="Category mix"
            tone="warning"
          >
            <div className="overview-stat">
              <strong>{data.kpis.top_category_code ?? "No category data yet"}</strong>
              <span>
                {formatNumber(data.kpis.top_category_paper_count)} papers in the strongest category
              </span>
            </div>
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        description="Weekly publication counts are connected and ready for a dedicated chart component."
        eyebrow="Research flow"
        title="Publication Activity"
      >
        <ResponsiveGrid variant="wide">
          <Card
            description="Prepared for chart rendering"
            eyebrow="Live dataset"
            icon={<ChartColumnIncreasing size={18} />}
            title="Weekly publication trend"
            tone="accent"
          >
            <div className="placeholder-preview">
              <div className="data-bar-chart" aria-label="Weekly publication counts">
                {buildTrendHeights(data.weekly_trend, 6).map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="overview-data-stack">
                <p>
                  Latest week:{" "}
                  <strong>
                    {formatDate(latestWeek?.week_start)} · {formatNumber(latestWeek?.paper_count)} papers
                  </strong>
                </p>
                <p>The chart layer can now bind directly to the connected `weekly_trend` series.</p>
              </div>
            </div>
          </Card>

          <Card
            description="Live pipeline and collaboration context"
            eyebrow="Connected summary"
            icon={<Lightbulb size={18} />}
            title="Momentum context"
            tone="info"
          >
            <div className="overview-data-stack">
              <p>
                Latest ETL run: <strong>{data.kpis.latest_etl_status ?? "Unavailable"}</strong>
              </p>
              <p>
                Average authors per paper:{" "}
                <strong>{formatDecimal(data.author_statistics.average_authors_per_paper)}</strong>
              </p>
              <p>
                Strongest category movement:{" "}
                <strong>
                  {leadingCategoryGrowth
                    ? `${leadingCategoryGrowth.category_code} (${signedNumber(
                        leadingCategoryGrowth.absolute_growth,
                      )})`
                    : "No growth data yet"}
                </strong>
              </p>
            </div>
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        description="Topic distribution, growth, and emerging movement now come from the live backend response."
        eyebrow="Signals"
        title="Topic Intelligence"
      >
        <ResponsiveGrid variant="standard">
          <Card
            description="Top topic distribution"
            eyebrow="Connected list"
            icon={<Radar size={18} />}
            title="Topic distribution"
            tone="accent"
          >
            <ul className="overview-list">
              {leadingTopics.map((topic) => (
                <li key={topic.topic_id}>
                  <span>{topic.topic_name}</span>
                  <strong>
                    {formatNumber(topic.paper_count)} · {formatPercent(topic.percentage_of_tagged_papers)}
                  </strong>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            description="30-day movement"
            eyebrow="Connected list"
            icon={<ChartColumnIncreasing size={18} />}
            title="Topic momentum"
            tone="info"
          >
            <ul className="overview-list">
              {leadingTopicGrowth.map((topic) => (
                <li key={topic.topic_id}>
                  <span>{topic.topic_name}</span>
                  <strong>
                    {topic.growth_status} · {signedNumber(topic.absolute_growth)}
                  </strong>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            description="Signal summary"
            eyebrow="Connected summary"
            icon={<Lightbulb size={18} />}
            title="Emerging signals"
            tone="success"
          >
            <div className="overview-data-stack">
              <p>
                Topics with active growth windows:{" "}
                <strong>{formatNumber(data.topic_growth.length)}</strong>
              </p>
              <p>
                Highest 30-day change:{" "}
                <strong>{formatGrowthSignal(leadingTopicGrowth[0])}</strong>
              </p>
              <p>New insights can now be layered on top of the connected topic datasets.</p>
            </div>
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        description="Category mix and author leaders are now driven by the overview payload."
        eyebrow="Navigation preview"
        title="Category and Author Preview"
      >
        <ResponsiveGrid variant="standard">
          <Card
            description="Primary category leaders"
            eyebrow="Connected list"
            icon={<FileStack size={18} />}
            title="Primary categories"
            tone="warning"
          >
            <ul className="overview-list">
              {leadingCategories.map((category) => (
                <li key={category.category_code}>
                  <span>{category.category_code}</span>
                  <strong>
                    {formatNumber(category.paper_count)} ·{" "}
                    {formatPercent(category.percentage_of_primary_categorized_papers)}
                  </strong>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            description="Top author rankings"
            eyebrow="Connected list"
            icon={<UsersRound size={18} />}
            title="Top authors"
            tone="success"
          >
            <ul className="overview-list">
              {leadingAuthors.map((author) => (
                <li key={author.author_id}>
                  <span>{author.author_name}</span>
                  <strong>{formatNumber(author.paper_count)} papers</strong>
                </li>
              ))}
            </ul>
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
            <ul className="overview-paper-list">
              {latestPapers.map((paper) => (
                <li key={paper.paper_id}>
                  <div>
                    <strong>{paper.title}</strong>
                    <span>
                      {paper.primary_category ?? "Uncategorized"} · {formatDate(paper.published_date)}
                    </span>
                  </div>
                  <p>{summarizePaper(paper)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </ResponsiveGrid>
      </PageSection>
    </PageContainer>
  );
}

function buildTrendHeights(points: WeeklyTrendPoint[], maxBars: number): number[] {
  const selectedPoints = points.slice(-maxBars);

  if (selectedPoints.length === 0) {
    return Array.from({ length: maxBars }, () => 28);
  }

  const maximumCount = Math.max(...selectedPoints.map((point) => point.paper_count), 1);

  return selectedPoints.map((point) => Math.max(24, Math.round((point.paper_count / maximumCount) * 100)));
}

function formatGrowthSignal(topic: TopicGrowthItem | undefined): string {
  if (!topic) {
    return "No growth data yet";
  }

  return `${topic.topic_name} (${topic.growth_status}, ${signedNumber(topic.absolute_growth)})`;
}

function summarizePaper(paper: LatestPaperItem): string {
  const authorsLabel =
    paper.authors.length > 0 ? paper.authors.slice(0, 2).join(", ") : "Author metadata pending";
  const topicsLabel =
    paper.topics.length > 0 ? paper.topics.slice(0, 2).join(", ") : "Topic enrichment pending";

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

function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0.00";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0%";
  }

  return `${formatDecimal(value)}%`;
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

function signedNumber(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}
