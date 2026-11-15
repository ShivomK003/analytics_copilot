import { useMemo, useState } from "react";
import { EmptyState } from "../feedback/EmptyState";
import { HeatmapCategoryPicker, TopicCategoryGrid } from "../heatmap/TopicCategoryGrid";
import type { CategoryTopicMatrixItem } from "../../types/dashboard";

const MAX_CATEGORIES = 10;

export function CategoryTopicMatrix({ data }: { data: CategoryTopicMatrixItem[] }) {
  const [selectedCategories, setSelectedCategories] = useState<string[] | null>(null);
  const { categories, topics, counts, maximum } = useMemo(() => {
    const categoryTotals = new Map<string, number>();
    const topicTotals = new Map<string, number>();
    const cellCounts = new Map<string, number>();
    for (const item of data) {
      const count = item.shared_paper_count;
      categoryTotals.set(item.category_code, (categoryTotals.get(item.category_code) ?? 0) + count);
      topicTotals.set(item.topic_name, (topicTotals.get(item.topic_name) ?? 0) + count);
      const key = `${item.category_code}:${item.topic_name}`;
      cellCounts.set(key, (cellCounts.get(key) ?? 0) + count);
    }
    return {
      categories: [...categoryTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => ({ key: name, label: name })),
      topics: [...topicTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => ({ key: name, label: name })),
      counts: cellCounts,
      maximum: Math.max(0, ...cellCounts.values()),
    };
  }, [data]);
  const visibleKeys =
    selectedCategories ?? categories.slice(0, MAX_CATEGORIES).map((category) => category.key);
  const visibleCategories = visibleKeys.flatMap((key) =>
    categories.filter((category) => category.key === key),
  );

  if (!data.length) {
    return (
      <EmptyState
        title="No category-topic relationships available"
        description="Category-topic relationships will appear once categorized and topic-tagged papers are available."
      />
    );
  }

  return (
    <div className="chart-shell">
      <HeatmapCategoryPicker
        categories={categories}
        selected={visibleKeys}
        onChange={setSelectedCategories}
        onReset={() => setSelectedCategories(null)}
        maximum={MAX_CATEGORIES}
      />
      <TopicCategoryGrid
        categories={visibleCategories}
        topics={topics}
        maximum={maximum}
        metricLabel="Shared paper count"
        getCell={({ categoryKey, topicKey }) => {
          // The legacy Categories grid explicitly fills absent overlap pairs with zero.
          const count = counts.get(`${categoryKey}:${topicKey}`) ?? 0;
          return {
            value: count,
            label: count.toLocaleString("en-US"),
            description: `${count.toLocaleString("en-US")} papers associated with both the category and topic.`,
          };
        }}
      />
      <p className="chart-caption">
        Each cell represents the number of papers associated with both the category and topic.
        Darker cells indicate higher counts. Papers may contribute to multiple categories and
        topics.
      </p>
    </div>
  );
}
