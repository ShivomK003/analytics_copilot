import { PaperSearchToolbar } from "../components/papers/PaperSearchToolbar";
import { ContextualPaperExplorer } from "../components/papers/ContextualPaperExplorer";
import { PaperResults, PaperPagination } from "../components/papers/PaperResults";
import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";

import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";

import { usePaperSearch, usePaperCount } from "../hooks/usePapers";
import type { PaperSearchParams } from "../types/dashboard";

const PAGE_SIZE = 10;

const RESEARCH_TOPICS = ["llm", "agents", "rag", "reasoning", "vision", "multimodal", "rl"];

const SORT_OPTIONS = ["newest", "oldest", "relevance"] as const;

type SortOption = (typeof SORT_OPTIONS)[number];

function getSort(value: string | null): SortOption {
  return SORT_OPTIONS.find((option) => option === value) ?? "newest";
}

export function PapersPage() {
  const [params] = useSearchParams();
  const contextual = [
    "evidence",
    "source",
    "topic_id",
    "category_scope",
    "window",
    "window_weeks",
    "partial_week",
  ].some((key) => params.has(key));
  return contextual ? <ContextualPaperExplorer /> : <IndependentPaperExplorer />;
}

function IndependentPaperExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("query") ?? "";
  const topic = searchParams.get("topic") ?? "";
  const category = searchParams.get("category") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const sort = getSort(searchParams.get("sort"));

  const rawPage = Number(searchParams.get("page") ?? "1");
  const currentPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const offset = (currentPage - 1) * PAGE_SIZE;

  const [draft, setDraft] = useState({ query, category, search: query, categorySearch: category });
  // URL changes reset committed fields; date and sort edits retain unfinished search text.
  if (draft.query !== query || draft.category !== category) {
    setDraft({ query, category, search: query, categorySearch: category });
  }

  const filters: PaperSearchParams = {
    query: query || undefined,
    topic: topic || undefined,
    category: category || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sort,
    limit: PAGE_SIZE,
    offset,
  };

  const papersQuery = usePaperSearch(filters);
  const countQuery = usePaperCount(filters);

  const papers = papersQuery.data ?? [];
  const totalPapers = countQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalPapers / PAGE_SIZE);

  const returnTo = `/papers${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  function updateFilters(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);

    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });

    next.delete("page");
    setSearchParams(next);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilters({
      query: draft.search.trim(),
      category: draft.categorySearch.trim(),
    });
  }

  function handleReset() {
    setDraft({ query: "", category: "", search: "", categorySearch: "" });
    setSearchParams({});
  }

  function changePage(page: number) {
    if (page < 1) return;
    if (countQuery.isSuccess && page > totalPages) return;

    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    setSearchParams(next);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Papers"
        description="Discover academic publications, explore research topics, and find related work."
      />

      <PageSection
        eyebrow="Research discovery"
        title="Explore Publications"
        description="Search indexed arXiv papers using keywords, research topics, categories, and publication dates."
      >
        <Card
          eyebrow="Research intelligence"
          title="Paper Search"
          description="Search publication titles and abstracts."
          icon={<Search size={18} />}
          tone="accent"
        >
          <PaperSearchToolbar
            value={draft.search}
            onChange={(search) => setDraft({ ...draft, search })}
            onSubmit={handleSearch}
            sort={sort}
            sortOptions={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "relevance", label: "Relevance" },
            ]}
            onSortChange={(value) => updateFilters({ sort: value })}
          >
            <input
              type="text"
              aria-label="arXiv category"
              placeholder="Category (e.g. cs.LG)"
              value={draft.categorySearch}
              onChange={(event) => setDraft({ ...draft, categorySearch: event.target.value })}
              className="form-control category-search"
            />
          </PaperSearchToolbar>

          <div className="filter-grid">
            <label className="filter-field">
              <span>Research topic</span>
              <select
                value={topic}
                onChange={(event) => updateFilters({ topic: event.target.value })}
                className="form-control"
              >
                <option value="">All topics</option>
                {RESEARCH_TOPICS.map((item) => (
                  <option key={item} value={item}>
                    {item.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span>Published from</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => updateFilters({ date_from: event.target.value })}
                className="form-control"
              />
            </label>

            <label className="filter-field">
              <span>Published to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => updateFilters({ date_to: event.target.value })}
                className="form-control"
              />
            </label>
          </div>

          <div className="filter-toolbar">
            <button type="button" onClick={handleReset} className="button button-secondary">
              Reset filters
            </button>
          </div>

          <div className="results-heading">
            <div>
              <h3 style={resultsTitleStyle}>Matching Publications</h3>
              <p style={mutedStyle}>
                {query
                  ? `Results matching "${query}".`
                  : "Browse publications in the indexed dataset."}
              </p>
            </div>

            {countQuery.isSuccess && (
              <span style={countStyle}>{totalPapers.toLocaleString()} papers</span>
            )}
          </div>

          {papersQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading publications...
            </div>
          ) : papersQuery.isError ? (
            <ErrorState
              title="Unable to retrieve publications"
              description={
                papersQuery.error instanceof Error
                  ? papersQuery.error.message
                  : "An unexpected error occurred."
              }
              onRetry={() => void papersQuery.refetch()}
              retryLabel="Retry paper search"
            />
          ) : papers.length === 0 ? (
            <EmptyState
              title="No publications found"
              description="Try different keywords, filters, or page numbers."
            />
          ) : (
            <>
              <PaperResults papers={papers} returnTo={returnTo} />
              <PaperPagination
                page={currentPage}
                total={countQuery.isSuccess ? totalPapers : undefined}
                pageSize={PAGE_SIZE}
                busy={papersQuery.isFetching}
                onPageChange={changePage}
              />
            </>
          )}
        </Card>
      </PageSection>
    </PageContainer>
  );
}

const resultsTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 600,
  color: "var(--color-text-primary)",
};

const mutedStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  color: "var(--color-text-secondary)",
};

const countStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--color-text-secondary)",
  whiteSpace: "nowrap",
};
