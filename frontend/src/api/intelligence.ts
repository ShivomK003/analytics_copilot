import { get } from "./client";
import type {
  IntelligenceDataMap,
  IntelligenceEndpoint,
  IntelligenceFilterMap,
  IntelligenceResponse,
} from "../types/intelligence";

const defaults: Partial<Record<IntelligenceEndpoint, Record<string, string | number | boolean>>> = {
  momentum: { mode: "count", include_partial_weeks: true },
  "momentum-matrix": { window_weeks: 4 },
  relationships: { min_shared_papers: 1 },
  "topic-category-heatmap": { category_scope: "all" },
  composition: { include_partial_weeks: true },
  evidence: { category_scope: "all", limit: 20, offset: 0 },
};

/** Canonical wire parameters also serve as complete, order-independent query keys. */
export function intelligenceSearch<K extends IntelligenceEndpoint>(
  endpoint: K,
  filters: IntelligenceFilterMap[K],
): string {
  const values = { ...defaults[endpoint], ...filters };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) {
    if (key === "topic_ids" && Array.isArray(value)) {
      // Preserve evidence duplicates so its strict two-topic validation is not bypassed.
      const ids = endpoint === "evidence" ? value : [...new Set(value)];
      [...ids].sort((a, b) => a - b).forEach((id) => search.append("topic_id", String(id)));
    } else if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

/** Fetch one documented envelope; cancellation propagates directly to fetch. */
export function getIntelligence<K extends IntelligenceEndpoint>(
  endpoint: K,
  filters: IntelligenceFilterMap[K],
  signal?: AbortSignal,
): Promise<IntelligenceResponse<IntelligenceDataMap[K]>> {
  const search = intelligenceSearch(endpoint, filters);
  return get(`/intelligence/${endpoint}${search ? `?${search}` : ""}`, { signal });
}

export const getIntelligenceCoverage = (signal?: AbortSignal) =>
  getIntelligence("coverage", {}, signal);
export const getIntelligenceTopics = (
  filters: IntelligenceFilterMap["topics"] = {},
  signal?: AbortSignal,
) => getIntelligence("topics", filters, signal);
export const getIntelligenceMomentum = (
  filters: IntelligenceFilterMap["momentum"] = {},
  signal?: AbortSignal,
) => getIntelligence("momentum", filters, signal);
export const getIntelligenceMatrix = (
  filters: IntelligenceFilterMap["momentum-matrix"] = {},
  signal?: AbortSignal,
) => getIntelligence("momentum-matrix", filters, signal);
export const getIntelligenceRelationships = (
  filters: IntelligenceFilterMap["relationships"] = {},
  signal?: AbortSignal,
) => getIntelligence("relationships", filters, signal);
export const getIntelligenceHeatmap = (
  filters: IntelligenceFilterMap["topic-category-heatmap"] = {},
  signal?: AbortSignal,
) => getIntelligence("topic-category-heatmap", filters, signal);
export const getIntelligenceComposition = (
  filters: IntelligenceFilterMap["composition"] = {},
  signal?: AbortSignal,
) => getIntelligence("composition", filters, signal);
export const getIntelligenceEvidence = (
  filters: IntelligenceFilterMap["evidence"] = {},
  signal?: AbortSignal,
) => getIntelligence("evidence", filters, signal);
