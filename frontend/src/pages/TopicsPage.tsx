import { Activity, Tags, TrendingUp } from "lucide-react";

import { TopicDistributionChart } from "../components/charts/TopicDistributionChart";
import { WeeklyTopicChart } from "../components/charts/WeeklyTopicChart";
import { TopicGrowthTable } from "../components/topics/TopicGrowthTable";

import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";

import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { Card } from "../components/ui/Card";

import {
  useTopicDistribution,
  useTopicWeekly,
  useTopicGrowth,
} from "../hooks/useTopics";

export function TopicsPage() {
  const distributionQuery = useTopicDistribution();
  const weeklyQuery = useTopicWeekly();
  const growthQuery = useTopicGrowth();

  return (
    <PageContainer>
      <PageHeader
        title="Topics"
        description="Explore research topics, publication activity, and emerging areas across the arXiv dataset."
      />

      {/* Topic Distribution */}
      <PageSection
        eyebrow="Research landscape"
        title="Topic Distribution"
        description="Explore the most frequently identified research topics across indexed papers."
      >
        <Card
          eyebrow="Topic analytics"
          title="Most Researched Topics"
          description="Top 8 research topics ranked by paper count"
          icon={<Tags size={18} />}
          tone="accent"
        >
          {distributionQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading topic distribution...
            </div>
          ) : distributionQuery.isError ? (
            <ErrorState
              title="Topic distribution unavailable"
              description={
                distributionQuery.error instanceof Error
                  ? distributionQuery.error.message
                  : "Unable to retrieve topic distribution."
              }
              onRetry={() => void distributionQuery.refetch()}
              retryLabel="Retry topic distribution"
            />
          ) : distributionQuery.data.length === 0 ? (
            <EmptyState
              title="No topic data available"
              description="Topic distribution will appear once topic-tagged papers are available."
            />
          ) : (
            <TopicDistributionChart data={distributionQuery.data} />
          )}
        </Card>
      </PageSection>

      {/* Weekly Topic Activity */}
      <PageSection
        eyebrow="Research activity"
        title="Weekly Topic Activity"
        description="Compare weekly publication activity across research topics."
      >
        <Card
          eyebrow="Topic trends"
          title="Research Activity Over Time"
          description="Select topics to compare their weekly publication counts."
          icon={<Activity size={18} />}
          tone="accent"
        >
          {weeklyQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading weekly topic activity...
            </div>
          ) : weeklyQuery.isError ? (
            <ErrorState
              title="Weekly topic activity unavailable"
              description={
                weeklyQuery.error instanceof Error
                  ? weeklyQuery.error.message
                  : "Unable to retrieve weekly topic activity."
              }
              onRetry={() => void weeklyQuery.refetch()}
              retryLabel="Retry weekly activity"
            />
          ) : weeklyQuery.data.length === 0 ? (
            <EmptyState
              title="No weekly topic data available"
              description="Weekly activity will appear once topic-tagged papers are available."
            />
          ) : (
            <WeeklyTopicChart data={weeklyQuery.data} />
          )}
        </Card>
      </PageSection>

      {/* Topic Growth Table */}
      <PageSection
        eyebrow="Research momentum"
        title="Topic Growth"
        description="Identify research topics gaining or losing momentum over the latest 30 days."
      >
        <Card
          eyebrow="Growth analytics"
          title="Fastest Growing Topics"
          description="Current 30 days compared with the previous 30 days."
          icon={<TrendingUp size={18} />}
          tone="accent"
        >
          {growthQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading topic growth...
            </div>
          ) : growthQuery.isError ? (
            <ErrorState
              title="Topic growth unavailable"
              description={
                growthQuery.error instanceof Error
                  ? growthQuery.error.message
                  : "Unable to retrieve topic growth."
              }
              onRetry={() => void growthQuery.refetch()}
              retryLabel="Retry topic growth"
            />
          ) : growthQuery.data.length === 0 ? (
            <EmptyState
              title="No topic growth data available"
              description="Growth analytics will appear once sufficient historical data is available."
            />
          ) : (
            <TopicGrowthTable data={growthQuery.data} />
          )}
        </Card>
      </PageSection>
    </PageContainer>
  );
}