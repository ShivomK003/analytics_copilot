import { queryOptions, useQuery } from "@tanstack/react-query";
import { getIntelligence, intelligenceSearch } from "../api/intelligence";
import type { IntelligenceEndpoint, IntelligenceFilterMap } from "../types/intelligence";

/** No automatic retries, including 422/503; retry actions are explicit in the UI. */
export function intelligenceQueryOptions<K extends IntelligenceEndpoint>(
  endpoint: K,
  filters: IntelligenceFilterMap[K],
  enabled = true,
) {
  return queryOptions({
    queryKey: ["intelligence", endpoint, intelligenceSearch(endpoint, filters)],
    queryFn: ({ signal }) => getIntelligence(endpoint, filters, signal),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
}

export const useIntelligenceCoverage = () => useQuery(intelligenceQueryOptions("coverage", {}));
export const useIntelligenceTopics = (filters: IntelligenceFilterMap["topics"] = {}) =>
  useQuery(intelligenceQueryOptions("topics", filters));
// Future visualization hooks are opt-in: mounting one cannot accidentally fan out requests.
export const useIntelligenceMomentum = (
  filters: IntelligenceFilterMap["momentum"] = {},
  enabled = false,
) => useQuery(intelligenceQueryOptions("momentum", filters, enabled));
export const useIntelligenceMatrix = (
  filters: IntelligenceFilterMap["momentum-matrix"] = {},
  enabled = false,
) => useQuery(intelligenceQueryOptions("momentum-matrix", filters, enabled));
export const useIntelligenceRelationships = (
  filters: IntelligenceFilterMap["relationships"] = {},
  enabled = false,
) => useQuery(intelligenceQueryOptions("relationships", filters, enabled));
export const useIntelligenceHeatmap = (
  filters: IntelligenceFilterMap["topic-category-heatmap"] = {},
  enabled = false,
) => useQuery(intelligenceQueryOptions("topic-category-heatmap", filters, enabled));
export const useIntelligenceComposition = (
  filters: IntelligenceFilterMap["composition"] = {},
  enabled = false,
) => useQuery(intelligenceQueryOptions("composition", filters, enabled));
export const useIntelligenceEvidence = (
  filters: IntelligenceFilterMap["evidence"] = {},
  enabled = false,
) => useQuery(intelligenceQueryOptions("evidence", filters, enabled));
