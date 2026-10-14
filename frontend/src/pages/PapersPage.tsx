import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";

import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";

import { usePaperSearch, usePaperCount } from "../hooks/usePapers";
import type { PaperSearchParams } from "../types/dashboard";

const PAGE_SIZE = 10;

const RESEARCH_TOPICS = [
  "llm", "agents", "rag", "reasoning",
  "vision", "multimodal", "rl",
];

const SORT_OPTIONS = ["newest", "oldest", "relevance"] as const;

type SortOption = (typeof SORT_OPTIONS)[number];

function getSort(value: string | null): SortOption {
  return SORT_OPTIONS.find((option) => option === value) ?? "newest";
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

export function PapersPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("query") ?? "";
  const topic = searchParams.get("topic") ?? "";
  const category = searchParams.get("category") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const sort = getSort(searchParams.get("sort"));

  const rawPage = Number(searchParams.get("page") ?? "1");
  const currentPage =
    Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const offset = (currentPage - 1) * PAGE_SIZE;

  const [searchInput, setSearchInput] = useState(query);
  const [categoryInput, setCategoryInput] = useState(category);

  useEffect(() => {
    setSearchInput(query);
    setCategoryInput(category);
  }, [query, category]);

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

  const isFirstPage = currentPage === 1;
  const isLastPage =
    !countQuery.isSuccess || currentPage >= totalPages;

  const returnTo = `/papers${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;

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
      query: searchInput.trim(),
      category: categoryInput.trim(),
    });
  }

  function handleReset() {
    setSearchInput("");
    setCategoryInput("");
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
          <form onSubmit={handleSearch} style={searchFormStyle}>
            <input
              type="search"
              aria-label="Search papers"
              placeholder="Search titles, abstracts, and keywords..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              style={inputStyle}
            />

            <input
              type="text"
              aria-label="arXiv category"
              placeholder="Category (e.g. cs.LG)"
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.target.value)}
              style={{ ...inputStyle, flex: "0 1 190px" }}
            />

            <button type="submit" style={primaryButtonStyle}>
              Search
            </button>
          </form>

          <div style={filterGridStyle}>
            <label style={fieldStyle}>
              <span>Research topic</span>
              <select
                value={topic}
                onChange={(event) =>
                  updateFilters({ topic: event.target.value })
                }
                style={controlStyle}
              >
                <option value="">All topics</option>
                {RESEARCH_TOPICS.map((item) => (
                  <option key={item} value={item}>
                    {item.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              <span>Published from</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) =>
                  updateFilters({ date_from: event.target.value })
                }
                style={controlStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span>Published to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) =>
                  updateFilters({ date_to: event.target.value })
                }
                style={controlStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) =>
                  updateFilters({ sort: event.target.value })
                }
                style={controlStyle}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="relevance">Relevance</option>
              </select>
            </label>
          </div>

          <div style={toolbarStyle}>
            <button
              type="button"
              onClick={handleReset}
              style={secondaryButtonStyle}
            >
              Reset filters
            </button>
          </div>

          <div style={resultsHeaderStyle}>
            <div>
              <h3 style={resultsTitleStyle}>Matching Publications</h3>
              <p style={mutedStyle}>
                {query
                  ? `Results matching "${query}".`
                  : "Browse publications in the indexed dataset."}
              </p>
            </div>

            {countQuery.isSuccess && (
              <span style={countStyle}>
                {totalPapers.toLocaleString()} papers
              </span>
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
              <div style={resultsListStyle}>
                {papers.map((paper) => (
                  <Link
                    key={paper.paper_id}
                    to={`/papers/${encodeURIComponent(paper.paper_id)}`}
                    state={{ returnTo }}
                    style={paperRowStyle}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={paperTitleStyle}>{paper.title}</h3>

                      <p style={paperMetadataStyle}>
                        {formatDate(paper.published_date)}
                        {paper.primary_category &&
                          ` · ${paper.primary_category}`}
                      </p>

                      {paper.abstract && (
                        <p style={abstractPreviewStyle}>
                          {paper.abstract}
                        </p>
                      )}

                      {paper.topics.length > 0 && (
                        <div style={tagsStyle}>
                          {paper.topics.map((item) => (
                            <span key={item} style={tagStyle}>
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <ArrowRight size={18} style={{ flexShrink: 0 }} />
                  </Link>
                ))}
              </div>

              <div style={paginationStyle}>
                <button
                  type="button"
                  disabled={isFirstPage || papersQuery.isFetching}
                  onClick={() => changePage(currentPage - 1)}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: isFirstPage ? 0.4 : 1,
                  }}
                >
                  Previous
                </button>

                <div style={pageInfoStyle}>
                  {countQuery.isSuccess ? (
                    <>
                      <div>
                        Page {currentPage} of {totalPages}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        {totalPapers.toLocaleString()} papers found
                      </div>
                    </>
                  ) : (
                    <div>Page {currentPage}</div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isLastPage || papersQuery.isFetching}
                  onClick={() => changePage(currentPage + 1)}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: isLastPage ? 0.4 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </Card>
      </PageSection>
    </PageContainer>
  );
}

const searchFormStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 20,
};

const inputStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
  padding: "11px 14px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  fontSize: 14,
};

const controlStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  fontSize: 13,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
  gap: 14,
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 16,
  marginBottom: 24,
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid var(--color-accent)",
  background: "var(--color-accent)",
  color: "#ffffff",
  fontWeight: 500,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-secondary)",
  fontWeight: 500,
  cursor: "pointer",
};

const resultsHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
  paddingTop: 20,
  borderTop: "1px solid var(--color-border)",
};

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

const resultsListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const paperRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "18px 20px",
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  textDecoration: "none",
  color: "var(--color-text-secondary)",
};

const paperTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 16,
  lineHeight: 1.5,
  fontWeight: 600,
  color: "var(--color-text-primary)",
};

const paperMetadataStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 12,
  color: "var(--color-text-secondary)",
};

const abstractPreviewStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--color-text-secondary)",
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const tagsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
};

const tagStyle: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 6,
  background: "var(--color-border)",
  color: "var(--color-text-primary)",
  fontSize: 11,
  fontWeight: 500,
};

const paginationStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 24,
};

const pageInfoStyle: CSSProperties = {
  textAlign: "center",
  color: "var(--color-text-secondary)",
  fontSize: 13,
};