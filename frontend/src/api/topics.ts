import { get } from "./client";

import type {
  TopicDistributionItem,
  TopicWeeklyItem,
  TopicGrowthItem,
} from "../types/dashboard";

export function getTopicDistribution() {
  return get<TopicDistributionItem[]>("/topics/distribution");
}

export function getTopicWeekly() {
  return get<TopicWeeklyItem[]>("/topics/weekly");
}

export function getTopicGrowth() {
  return get<TopicGrowthItem[]>("/topics/growth");
}