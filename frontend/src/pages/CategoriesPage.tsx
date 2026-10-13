import { useState } from "react";
import { Layers, Activity, TrendingUp, Grid3X3 } from "lucide-react";

import { CategoryDistributionChart } from "../components/charts/CategoryDistributionChart";
import { CategoryGrowthTable } from "../components/categories/CategoryGrowthTable";
import { WeeklyCategoryChart } from "../components/charts/WeeklyCategoryChart";
import { CategoryTopicMatrix } from "../components/categories/CategoryTopicMatrix";

import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";

import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { Card } from "../components/ui/Card";

import {
  useCategoryDistribution,
  usePrimaryCategoryDistribution,
  useCategoryWeekly,
  useCategoryGrowth,
  useCategoryTopicMatrix,
} from "../hooks/useCategories";

type DistributionMode = "primary" | "all";

export function CategoriesPage() {
  const [distributionMode, setDistributionMode] =
    useState<DistributionMode>("primary");

  const primaryQuery = usePrimaryCategoryDistribution();
  const allQuery = useCategoryDistribution();
  const weeklyQuery = useCategoryWeekly();
  const growthQuery = useCategoryGrowth();
  const matrixQuery = useCategoryTopicMatrix();

  const activeQuery =
    distributionMode === "primary" ? primaryQuery : allQuery;

  return (
    <PageContainer>
      <PageHeader
        title="Categories"
        description="Explore arXiv research categories, publication activity, and emerging research areas."
      />

      {/* Category Distribution */}
      <PageSection
        eyebrow="Research classification"
        title="Category Distribution"
        description="Explore how indexed research papers are distributed across arXiv categories."
      >
        <Card
          eyebrow="Category analytics"
          title="Research Category Distribution"
          description={
            distributionMode === "primary"
              ? "Top 10 primary research categories by paper count."
              : "Top 10 categories including secondary classifications."
          }
          icon={<Layers size={18} />}
          tone="accent"
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              aria-pressed={distributionMode === "primary"}
              onClick={() => setDistributionMode("primary")}
              style={getToggleStyle(distributionMode === "primary")}
            >
              Primary Categories
            </button>

            <button
              type="button"
              aria-pressed={distributionMode === "all"}
              onClick={() => setDistributionMode("all")}
              style={getToggleStyle(distributionMode === "all")}
            >
              All Categories
            </button>
          </div>

          {activeQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading category distribution...
            </div>
          ) : activeQuery.isError ? (
            <ErrorState
              title="Category distribution unavailable"
              description={
                activeQuery.error instanceof Error
                  ? activeQuery.error.message
                  : "Unable to retrieve category distribution."
              }
              onRetry={() => void activeQuery.refetch()}
              retryLabel="Retry category distribution"
            />
          ) : activeQuery.data.length === 0 ? (
            <EmptyState
              title="No category data available"
              description="Category distribution will appear once categorized papers are available."
            />
          ) : (
            <CategoryDistributionChart data={activeQuery.data} />
          )}

          <p className="chart-caption">
            {distributionMode === "primary"
              ? "Each paper has one primary category, so counts do not overlap."
              : "Papers can belong to multiple categories, so counts may overlap."}
          </p>
        </Card>
      </PageSection>

      {/* Weekly Category Activity */}
      <PageSection
        eyebrow="Research activity"
        title="Weekly Category Activity"
        description="Compare publication trends across arXiv research categories."
      >
        <Card
          eyebrow="Category trends"
          title="Research Activity Over Time"
          description="Select up to six categories to compare weekly publication counts."
          icon={<Activity size={18} />}
          tone="accent"
        >
          {weeklyQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading weekly category activity...
            </div>
          ) : weeklyQuery.isError ? (
            <ErrorState
              title="Weekly category activity unavailable"
              description={
                weeklyQuery.error instanceof Error
                  ? weeklyQuery.error.message
                  : "Unable to retrieve weekly category activity."
              }
              onRetry={() => void weeklyQuery.refetch()}
              retryLabel="Retry weekly activity"
            />
          ) : weeklyQuery.data.length === 0 ? (
            <EmptyState
              title="No weekly category data available"
              description="Weekly activity will appear once categorized papers are available."
            />
          ) : (
            <WeeklyCategoryChart data={weeklyQuery.data} />
          )}
        </Card>
      </PageSection>

      {/* Category Growth */}
      <PageSection
      eyebrow="Research momentum"
      title="Category Growth"
      description="Identify research categories gaining or losing momentum over the latest 30 days."
    >
      <Card
        eyebrow="Growth analytics"
        title="Fastest Growing Categories"
        description="Current 30 days compared with the previous 30 days."
        icon={<TrendingUp size={18} />}
        tone="accent"
      >
        {growthQuery.isPending ? (
          <div className="chart-shell" role="status">
            Loading category growth...
          </div>
        ) : growthQuery.isError ? (
          <ErrorState
            title="Category growth unavailable"
            description={
              growthQuery.error instanceof Error
                ? growthQuery.error.message
                : "Unable to retrieve category growth."
            }
            onRetry={() => void growthQuery.refetch()}
            retryLabel="Retry category growth"
          />
        ) : growthQuery.data.length === 0 ? (
          <EmptyState
            title="No category growth data available"
            description="Growth analytics will appear once sufficient historical data is available."
          />
        ) : (
          <CategoryGrowthTable data={growthQuery.data} />
        )}
      </Card>
    </PageSection>

        
    {/* Category-Topic Matrix */}
    <PageSection
      eyebrow="Research relationships"
      title="Category–Topic Matrix"
      description="Discover how research topics overlap across arXiv categories."
    >
      <Card
        eyebrow="Research intelligence"
        title="Category–Topic Relationships"
        description="Explore the number of papers shared between research categories and topics."
        icon={<Grid3X3 size={18} />}
        tone="accent"
      >
        {matrixQuery.isPending ? (
          <div className="chart-shell" role="status">
            Loading category-topic relationships...
          </div>
        ) : matrixQuery.isError ? (
          <ErrorState
            title="Category-topic relationships unavailable"
            description={
              matrixQuery.error instanceof Error
                ? matrixQuery.error.message
                : "Unable to retrieve category-topic relationships."
            }
            onRetry={() => void matrixQuery.refetch()}
            retryLabel="Retry category-topic matrix"
          />
        ) : matrixQuery.data.length === 0 ? (
          <EmptyState
            title="No category-topic data available"
            description="Relationships will appear once categorized and topic-tagged papers are available."
          />
        ) : (
          <CategoryTopicMatrix data={matrixQuery.data} />
        )}
      </Card>
    </PageSection>
    </PageContainer>
  );
}

function getToggleStyle(active: boolean) {
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: active
      ? "1px solid var(--color-accent)"
      : "1px solid var(--color-border)",
    background: active
      ? "var(--color-accent)"
      : "var(--color-surface)",
    color: active ? "#ffffff" : "var(--color-text-secondary)",
    fontWeight: 500,
    cursor: "pointer",
  };
}