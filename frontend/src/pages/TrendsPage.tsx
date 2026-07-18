import { useState } from "react";
import { Activity, ChartColumnIncreasing } from "lucide-react";
import { TrendChart } from "../components/charts/TrendChart";
import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { ResponsiveGrid } from "../components/layout/ResponsiveGrid";
import { Card } from "../components/ui/Card";
import {
  useCumulativeTrends,
  useDailyTrends,
  useMonthlyTrends,
  useWeeklyTrends,
} from "../hooks/useTrends";
import type { TrendChartPoint } from "../types/dashboard";
import { mapTrendData } from "../utils/mapTrendData";

type Granularity = "daily" | "weekly" | "monthly";

const PAGE_TITLE = "Trends";
const PAGE_DESCRIPTION =
  "Publication velocity and long-range growth views will turn this page into the operational trend center.";

export function TrendsPage() {
  const [granularity, setGranularity] = useState<Granularity>("weekly");

  const dailyQuery = useDailyTrends();
  const weeklyQuery = useWeeklyTrends();
  const monthlyQuery = useMonthlyTrends();
  const cumulativeQuery = useCumulativeTrends();

  const selectedTrendQuery =
    granularity === "daily"
      ? dailyQuery
      : granularity === "monthly"
        ? monthlyQuery
        : weeklyQuery;

  const selectedTrendData = mapTrendData(selectedTrendQuery.data ?? []);
  const cumulativeTrendData = mapTrendData(cumulativeQuery.data ?? []);

  const latestSelectedPoint = selectedTrendData.at(-1);
  const previousSelectedPoint = selectedTrendData.at(-2);
  const latestCumulativePoint = cumulativeTrendData.at(-1);
  const firstCumulativePoint = cumulativeTrendData[0];

  return (
    <PageContainer>
      <PageHeader description={PAGE_DESCRIPTION} title={PAGE_TITLE} />

      <PageSection
        description="Headline indicators update from the same selected trend series that drives the primary chart."
        eyebrow="Readout"
        title="Trend Summary"
      >
        <ResponsiveGrid variant="wide">
          <Card
            description={`${formatGranularityLabel(granularity)} publication count`}
            eyebrow="Live metric"
            icon={<Activity size={18} />}
            title="Volume snapshot"
            tone="accent"
          >
            <div className="overview-stat">
              <strong>{formatNumber(latestSelectedPoint?.value)}</strong>
              <span>
                Latest {granularity} point: {latestSelectedPoint?.label ?? "--"}
              </span>
            </div>
          </Card>

          <Card
            description="Change versus prior period"
            eyebrow="Live metric"
            icon={<ChartColumnIncreasing size={18} />}
            title="Growth direction"
            tone="info"
          >
            <div className="overview-stat">
              <strong>{getTrendDirectionLabel(latestSelectedPoint, previousSelectedPoint)}</strong>
              <span>
                {getTrendDirectionDescription(
                  latestSelectedPoint,
                  previousSelectedPoint,
                  granularity,
                )}
              </span>
            </div>
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        action={
          selectedTrendQuery.isFetching && selectedTrendData.length > 0 ? (
            <span className="status-pill status-pill-muted">Refreshing {granularity} trend</span>
          ) : undefined
        }
        description="Daily, weekly, and monthly volume views share one chart and switch locally without re-fetching on toggle."
        eyebrow="Visualization"
        title="Publication Volume"
      >
        <ResponsiveGrid variant="split">
          <Card
            description="Normalized publication counts"
            eyebrow="Connected chart"
            icon={<ChartColumnIncreasing size={18} />}
            title="Publication volume chart"
            tone="accent"
          >
            <div className="trend-toggle" role="tablist" aria-label="Publication volume granularity">
              {(["daily", "weekly", "monthly"] as const).map((value) => (
                <button
                  aria-selected={granularity === value}
                  className={`trend-toggle-button${granularity === value ? " is-active" : ""}`}
                  key={value}
                  onClick={() => setGranularity(value)}
                  role="tab"
                  type="button"
                >
                  {formatGranularityLabel(value)}
                </button>
              ))}
            </div>

            {selectedTrendQuery.isLoading && selectedTrendData.length === 0 ? (
              <ChartLoadingState />
            ) : selectedTrendQuery.isError && selectedTrendData.length === 0 ? (
              <ErrorState
                description={getErrorDescription(selectedTrendQuery.error)}
                onRetry={() => {
                  void selectedTrendQuery.refetch();
                }}
                retryLabel={`Retry ${granularity} trends`}
                title={`${formatGranularityLabel(granularity)} trend data is unavailable`}
              />
            ) : selectedTrendData.length === 0 ? (
              <EmptyState
                description={`No ${granularity} publication counts are available yet.`}
                title="No trend data available"
              />
            ) : (
              <TrendChart data={selectedTrendData} />
            )}
          </Card>

          <Card
            description="Active trend context"
            eyebrow="Connected summary"
            icon={<Activity size={18} />}
            title="Granularity context"
            tone="info"
          >
            <div className="trend-detail-list">
              <p>
                Active view: <strong>{formatGranularityLabel(granularity)}</strong>
              </p>
              <p>
                Data points: <strong>{formatNumber(selectedTrendData.length)}</strong>
              </p>
              <p>
                Range end: <strong>{latestSelectedPoint?.label ?? "--"}</strong>
              </p>
            </div>
          </Card>
        </ResponsiveGrid>
      </PageSection>

      <PageSection
        action={
          cumulativeQuery.isFetching && cumulativeTrendData.length > 0 ? (
            <span className="status-pill status-pill-muted">Refreshing cumulative trend</span>
          ) : undefined
        }
        description="Long-horizon movement shows how total publication volume compounds over time."
        eyebrow="Long-range view"
        title="Cumulative Growth"
      >
        <ResponsiveGrid variant="split">
          <Card
            description="Cumulative paper count"
            eyebrow="Connected chart"
            icon={<ChartColumnIncreasing size={18} />}
            title="Cumulative growth view"
            tone="accent"
          >
            {cumulativeQuery.isLoading && cumulativeTrendData.length === 0 ? (
              <ChartLoadingState />
            ) : cumulativeQuery.isError && cumulativeTrendData.length === 0 ? (
              <ErrorState
                description={getErrorDescription(cumulativeQuery.error)}
                onRetry={() => {
                  void cumulativeQuery.refetch();
                }}
                retryLabel="Retry cumulative trends"
                title="Cumulative trend data is unavailable"
              />
            ) : cumulativeTrendData.length === 0 ? (
              <EmptyState
                description="Cumulative paper counts will appear here once historical records are available."
                title="No cumulative trend data available"
              />
            ) : (
              <TrendChart data={cumulativeTrendData} />
            )}
          </Card>

          <Card
            description="Cumulative summary"
            eyebrow="Connected summary"
            icon={<Activity size={18} />}
            title="Growth interpretation"
            tone="success"
          >
            <div className="trend-detail-list">
              <p>
                Current cumulative total:{" "}
                <strong>{formatNumber(latestCumulativePoint?.value)}</strong>
              </p>
              <p>
                Timeline start: <strong>{firstCumulativePoint?.label ?? "--"}</strong>
              </p>
              <p>
                Timeline end: <strong>{latestCumulativePoint?.label ?? "--"}</strong>
              </p>
            </div>
          </Card>
        </ResponsiveGrid>
      </PageSection>
    </PageContainer>
  );
}

function ChartLoadingState() {
  return (
    <div className="chart-shell" role="status" aria-label="Loading trend chart">
      <div className="chart-frame chart-frame-line chart-loading">
        <span className="skeleton-line chart-loading-line chart-loading-line-short" />
        <span className="skeleton-line chart-loading-line" />
        <span className="skeleton-line chart-loading-line chart-loading-line-short" />
      </div>
    </div>
  );
}

function getTrendDirectionLabel(
  latestPoint: TrendChartPoint | undefined,
  previousPoint: TrendChartPoint | undefined,
): string {
  if (!latestPoint || !previousPoint) {
    return "Awaiting comparison";
  }

  if (latestPoint.value > previousPoint.value) {
    return "Upward trend";
  }

  if (latestPoint.value < previousPoint.value) {
    return "Cooling trend";
  }

  return "Stable trend";
}

function getTrendDirectionDescription(
  latestPoint: TrendChartPoint | undefined,
  previousPoint: TrendChartPoint | undefined,
  granularity: Granularity,
): string {
  if (!latestPoint || !previousPoint) {
    return `Waiting for multiple ${granularity} points.`;
  }

  const delta = latestPoint.value - previousPoint.value;
  const signedDelta = delta > 0 ? `+${formatNumber(delta)}` : formatNumber(delta);

  return `${signedDelta} versus the previous ${granularity} point.`;
}

function formatGranularityLabel(granularity: Granularity): string {
  return granularity.charAt(0).toUpperCase() + granularity.slice(1);
}

function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function getErrorDescription(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "The trend endpoint could not be loaded.";
}
