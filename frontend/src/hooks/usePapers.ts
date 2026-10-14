import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";

import type {
  PaperSearchParams,
  PaperSearchItem,
  PaperDetail,
  PaperAuthor,
  RelatedPaper,
} from "../types/dashboard";

type PaperFilters = Omit<
  PaperSearchParams,
  "sort" | "limit" | "offset"
>;

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

export function usePaperSearch({
  query,
  topic,
  category,
  dateFrom,
  dateTo,
  sort = "newest",
  limit = 10,
  offset = 0,
}: PaperSearchParams = {}) {
  return useQuery({
    queryKey: [
      "papers",
      "search",
      query,
      topic,
      category,
      dateFrom,
      dateTo,
      sort,
      limit,
      offset,
    ],
    queryFn: () =>
      get<PaperSearchItem[]>(
        `/papers/search?${buildQueryString({
          query,
          topic,
          category,
          date_from: dateFrom,
          date_to: dateTo,
          sort,
          limit,
          offset,
        })}`,
      ),
  });
}

export function usePaperCount({
  query,
  topic,
  category,
  dateFrom,
  dateTo,
}: PaperFilters = {}) {
  return useQuery({
    queryKey: [
      "papers",
      "count",
      query,
      topic,
      category,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      get<{ total: number }>(
        `/papers/count?${buildQueryString({
          query,
          topic,
          category,
          date_from: dateFrom,
          date_to: dateTo,
        })}`,
      ),
  });
}

export function usePaperDetails(paperId: string | null) {
  return useQuery({
    queryKey: ["papers", "details", paperId],
    queryFn: () =>
      get<PaperDetail>(
        `/papers/${encodeURIComponent(paperId!)}`,
      ),
    enabled: Boolean(paperId),
  });
}

export function usePaperAuthors(paperId: string | null) {
  return useQuery({
    queryKey: ["papers", "authors", paperId],
    queryFn: () =>
      get<PaperAuthor[]>(
        `/papers/${encodeURIComponent(paperId!)}/authors`,
      ),
    enabled: Boolean(paperId),
  });
}

export function useRelatedPapers(
  paperId: string | null,
  limit = 10,
) {
  return useQuery({
    queryKey: ["papers", "related", paperId, limit],
    queryFn: () =>
      get<RelatedPaper[]>(
        `/papers/${encodeURIComponent(paperId!)}/related?limit=${limit}`,
      ),
    enabled: Boolean(paperId),
  });
}