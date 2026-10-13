import { get } from "./client";

import type {
  CategoryDistributionItem,
  PrimaryCategoryDistributionItem,
  CategoryWeeklyItem,
  CategoryGrowthItem,
  CategoryTopicMatrixItem,
} from "../types/dashboard";

export function getCategoryDistribution() {
  return get<CategoryDistributionItem[]>("/categories/distribution");
}

export function getPrimaryCategoryDistribution() {
  return get<PrimaryCategoryDistributionItem[]>(
    "/categories/primary-distribution",
  );
}

export function getCategoryWeekly() {
  return get<CategoryWeeklyItem[]>("/categories/weekly");
}

export function getCategoryGrowth() {
  return get<CategoryGrowthItem[]>("/categories/growth");
}

export function getCategoryTopicMatrix() {
  return get<CategoryTopicMatrixItem[]>("/categories/topic-matrix");
}