import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";

import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";

import {
  useAuthorSearch,
  useAuthorCount,
} from "../hooks/useAuthors";

const PAGE_SIZE = 10;

const RESEARCH_TOPICS = [
  "llm",
  "agents",
  "rag",
  "reasoning",
  "vision",
  "multimodal",
  "rl",
];

export function AuthorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const searchQuery = searchParams.get("query") ?? "";
  const selectedTopic = searchParams.get("topic") ?? "";

  const rawPage = Number(searchParams.get("page") ?? "1");

  const currentPage =
    Number.isSafeInteger(rawPage) && rawPage > 0
      ? rawPage
      : 1;

  const offset = (currentPage - 1) * PAGE_SIZE;

  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const authorsQuery = useAuthorSearch({
    query: searchQuery || undefined,
    topic: selectedTopic || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const countQuery = useAuthorCount(
    searchQuery || undefined,
    selectedTopic || undefined,
  );

  const authors = authorsQuery.data ?? [];
  const totalAuthors = countQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalAuthors / PAGE_SIZE);

  const isFirstPage = currentPage === 1;

  const isLastPage =
    !countQuery.isSuccess || currentPage >= totalPages;

  function updateFilters(query: string, topic: string) {
    const params = new URLSearchParams();

    if (query) params.set("query", query);
    if (topic) params.set("topic", topic);

    setSearchParams(params);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilters(searchInput.trim(), selectedTopic);
  }

  function handleTopicChange(topic: string) {
    updateFilters(searchQuery, topic);
  }

  function handleReset() {
    setSearchInput("");
    setSearchParams({});
  }

  function changePage(page: number) {
    if (page < 1) return;
    if (countQuery.isSuccess && page > totalPages) return;

    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));

    setSearchParams(params);
  }

  const returnTo = `/authors${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;

  return (
    <PageContainer>
      <PageHeader
        title="Authors"
        description="Discover researchers, explore their research interests, and find relevant academic publications."
      />

      <PageSection
        eyebrow="Researcher discovery"
        title="Find Researchers"
        description="Search researchers by name or discover authors publishing in specific research areas."
      >
        <Card
          eyebrow="Research intelligence"
          title="Researcher Search"
          description="Search the indexed arXiv author database."
          icon={<Search size={18} />}
          tone="accent"
        >
          <form onSubmit={handleSearch} style={searchFormStyle}>
            <input
              type="search"
              placeholder="Search researcher names..."
              aria-label="Search researcher names"
              value={searchInput}
              onChange={(event) =>
                setSearchInput(event.target.value)
              }
              style={inputStyle}
            />

            <button type="submit" style={primaryButtonStyle}>
              Search
            </button>
          </form>

          <div style={filterRowStyle}>
            <label
              htmlFor="author-topic-filter"
              style={labelStyle}
            >
              Research topic
            </label>

            <select
              id="author-topic-filter"
              value={selectedTopic}
              onChange={(event) =>
                handleTopicChange(event.target.value)
              }
              style={selectStyle}
            >
              <option value="">All topics</option>

              {RESEARCH_TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {topic.toUpperCase()}
                </option>
              ))}
            </select>

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
              <h3 style={resultsTitleStyle}>
                Matching Researchers
              </h3>

              <p style={mutedStyle}>
                {selectedTopic
                  ? `Ranked by publications in ${selectedTopic.toUpperCase()}.`
                  : "Ranked by total indexed publications."}
              </p>
            </div>

            {countQuery.isSuccess && (
              <span style={countStyle}>
                {totalAuthors.toLocaleString()} researchers
              </span>
            )}
          </div>

          {authorsQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading researchers...
            </div>
          ) : authorsQuery.isError ? (
            <ErrorState
              title="Unable to retrieve researchers"
              description={
                authorsQuery.error instanceof Error
                  ? authorsQuery.error.message
                  : "An unexpected error occurred."
              }
              onRetry={() => void authorsQuery.refetch()}
              retryLabel="Retry author search"
            />
          ) : authors.length === 0 ? (
            <EmptyState
              title="No researchers found"
              description="Try another name, topic, or page."
            />
          ) : (
            <>
              <div style={resultsListStyle}>
                {authors.map((author) => (
                  <Link
                    key={author.author_id}
                    to={`/authors/${author.author_id}`}
                    state={{ returnTo }}
                    style={authorRowStyle}
                  >
                    <div>
                      <div style={authorNameStyle}>
                        {author.author_name}
                      </div>

                      <div style={authorMetadataStyle}>
                        {author.distinct_topic_count} research topics
                        {" · "}
                        {author.distinct_category_count} categories
                      </div>
                    </div>

                    <div style={authorRightStyle}>
                      <div style={paperCountStyle}>
                        {selectedTopic
                          ? (author.matching_topic_paper_count ?? 0)
                          : author.paper_count}
                      </div>

                      <div style={authorMetadataStyle}>
                        {selectedTopic
                          ? `${selectedTopic.toUpperCase()} papers`
                          : "Indexed papers"}
                      </div>
                    </div>

                    <ArrowRight
                      size={17}
                      style={{ flexShrink: 0 }}
                    />
                  </Link>
                ))}
              </div>

              <div style={paginationStyle}>
                <button
                  type="button"
                  disabled={
                    isFirstPage || authorsQuery.isFetching
                  }
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
                        {totalAuthors.toLocaleString()} researchers found
                      </div>
                    </>
                  ) : countQuery.isError ? (
                    <span>
                      Page {currentPage} · Total unavailable
                    </span>
                  ) : (
                    <span>Loading page count...</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    isLastPage || authorsQuery.isFetching
                  }
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

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 28,
};

const inputStyle: CSSProperties = {
  flex: "1 1 280px",
  minWidth: 0,
  padding: "11px 14px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  fontSize: 14,
};

const selectStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  fontSize: 13,
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

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
};

const mutedStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  color: "var(--color-text-secondary)",
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

const countStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--color-text-secondary)",
  whiteSpace: "nowrap",
};

const resultsListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const authorRowStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  padding: "16px 18px",
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  cursor: "pointer",
  textAlign: "left",
  textDecoration: "none",
  color: "var(--color-text-secondary)",
  boxSizing: "border-box",
};

const authorNameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--color-text-primary)",
  marginBottom: 6,
};

const authorMetadataStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--color-text-secondary)",
};

const authorRightStyle: CSSProperties = {
  textAlign: "right",
  flexShrink: 0,
  marginLeft: "auto",
};

const paperCountStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: "var(--color-text-primary)",
};

const paginationStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 24,
  gap: 12,
};

const pageInfoStyle: CSSProperties = {
  textAlign: "center",
  color: "var(--color-text-secondary)",
  fontSize: 13,
};