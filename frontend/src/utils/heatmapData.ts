import type { HeatmapCell, TopicCategoryHeatmapData } from "../types/intelligence";
import type { HeatmapCoordinate } from "../components/heatmap/TopicCategoryGrid";

export type HeatmapMetric = "paper_count" | "category_prevalence_pct" | "topic_distribution_pct";
export const heatmapMetrics: Record<HeatmapMetric, string> = {
  paper_count: "Shared paper count",
  category_prevalence_pct: "Category prevalence (%)",
  topic_distribution_pct: "Topic distribution (%)",
};
export interface HeatmapSelection {
  kind: "topic-category";
  topicIds: [number];
  categoryId: number;
  category: string;
  categoryScope: TopicCategoryHeatmapData["category_scope"];
  dateFrom: string | null;
  dateTo: string | null;
  metric: HeatmapMetric;
}

export function heatmapCells(data: TopicCategoryHeatmapData) {
  return new Map(data.cells.map((cell) => [`${cell.category_id}:${cell.topic_id}`, cell]));
}
export function heatmapMetricValue(cell: HeatmapCell | undefined, metric: HeatmapMetric) {
  return cell?.[metric];
}
export function formatHeatmapValue(value: number | null | undefined, metric: HeatmapMetric) {
  if (value == null) return "Unavailable";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}${metric === "paper_count" ? "" : "%"}`;
}
export function heatmapSelection(
  data: TopicCategoryHeatmapData,
  coordinate: HeatmapCoordinate,
  metric: HeatmapMetric,
): HeatmapSelection | null {
  const category = data.categories.find(
    (item) => String(item.category_id) === coordinate.categoryKey,
  );
  const topic = data.topics.find((item) => String(item.topic_id) === coordinate.topicKey);
  const cell = data.cells.find(
    (item) =>
      String(item.category_id) === coordinate.categoryKey &&
      String(item.topic_id) === coordinate.topicKey,
  );
  if (!category || !topic || !cell) return null;
  return {
    kind: "topic-category",
    topicIds: [topic.topic_id],
    categoryId: category.category_id,
    category: category.category_code,
    categoryScope: data.category_scope,
    dateFrom: data.date_from,
    dateTo: data.date_to,
    metric,
  };
}
