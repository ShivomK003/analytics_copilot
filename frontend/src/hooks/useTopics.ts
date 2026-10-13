import { useQuery } from "@tanstack/react-query";

import {
  getTopicDistribution,
  getTopicWeekly,
  getTopicGrowth,
} from "../api/topics";

const TOPICS_STALE_TIME = 5 * 60 * 1000;

export function useTopicDistribution() {
  return useQuery({
    queryKey: ["topics", "distribution"],
    queryFn: getTopicDistribution,
    staleTime: TOPICS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useTopicWeekly() {
  return useQuery({
    queryKey: ["topics", "weekly"],
    queryFn: getTopicWeekly,
    staleTime: TOPICS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useTopicGrowth() {
  return useQuery({
    queryKey: ["topics", "growth"],
    queryFn: getTopicGrowth,
    staleTime: TOPICS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}