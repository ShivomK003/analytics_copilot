import { useQuery } from "@tanstack/react-query";

import {
  getCategoryDistribution,
  getPrimaryCategoryDistribution,
  getCategoryWeekly,
  getCategoryGrowth,
  getCategoryTopicMatrix,
} from "../api/categories";

const CATEGORIES_STALE_TIME = 5 * 60 * 1000;

export function useCategoryDistribution() {
  return useQuery({
    queryKey: ["categories", "distribution"],
    queryFn: getCategoryDistribution,
    staleTime: CATEGORIES_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function usePrimaryCategoryDistribution() {
  return useQuery({
    queryKey: ["categories", "primary-distribution"],
    queryFn: getPrimaryCategoryDistribution,
    staleTime: CATEGORIES_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCategoryWeekly() {
  return useQuery({
    queryKey: ["categories", "weekly"],
    queryFn: getCategoryWeekly,
    staleTime: CATEGORIES_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCategoryGrowth() {
  return useQuery({
    queryKey: ["categories", "growth"],
    queryFn: getCategoryGrowth,
    staleTime: CATEGORIES_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCategoryTopicMatrix() {
  return useQuery({
    queryKey: ["categories", "topic-matrix"],
    queryFn: getCategoryTopicMatrix,
    staleTime: CATEGORIES_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}