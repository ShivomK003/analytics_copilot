import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";

import type {
  TopAuthorItem,
  AuthorSearchItem,
  AuthorTopicItem,
  AuthorPaperItem,
  AuthorStatistics,
  AuthorSearchParams,
  AuthorPapersParams,
} from "../types/dashboard";

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

export function useAuthorSearch({
  query,
  topic,
  limit = 10,
  offset = 0,
}: AuthorSearchParams = {}) {
  return useQuery({
    queryKey: ["authors", "search", query, topic, limit, offset],
    queryFn: () =>
      get<AuthorSearchItem[]>(
        `/authors/search?${buildQueryString({
          query,
          topic,
          limit,
          offset,
        })}`,
      ),
  });
}

export function useAuthorCount(
  query?: string,
  topic?: string,
) {
  return useQuery({
    queryKey: ["authors", "count", query, topic],
    queryFn: () =>
      get<{ total: number }>(
        `/authors/count?${buildQueryString({ query, topic })}`,
      ),
  });
}

export function useAuthorDetails(authorId: number | null) {
  return useQuery({
    queryKey: ["authors", "details", authorId],
    queryFn: () =>
      get<TopAuthorItem>(`/authors/${authorId}`),
    enabled: authorId !== null,
  });
}

export function useAuthorTopics(authorId: number | null) {
  return useQuery({
    queryKey: ["authors", "topics", authorId],
    queryFn: () =>
      get<AuthorTopicItem[]>(
        `/authors/topics?author_id=${authorId}`,
      ),
    enabled: authorId !== null,
  });
}

export function useAuthorPapers({
  authorId,
  topic,
  limit = 10,
  offset = 0,
}: AuthorPapersParams) {
  return useQuery({
    queryKey: ["authors", "papers", authorId, topic, limit, offset],
    queryFn: () =>
      get<AuthorPaperItem[]>(
        `/authors/${authorId}/papers?${buildQueryString({
          topic,
          limit,
          offset,
        })}`,
      ),
    enabled: Number.isInteger(authorId) && authorId > 0,
  });
}

export function useAuthorStatistics() {
  return useQuery({
    queryKey: ["authors", "statistics"],
    queryFn: () =>
      get<AuthorStatistics>("/authors/statistics"),
  });
}

export function useAuthorRankings(limit = 100) {
  return useQuery({
    queryKey: ["authors", "rankings", limit],
    queryFn: () =>
      get<TopAuthorItem[]>(
        `/authors/rankings?limit=${limit}`,
      ),
  });
}