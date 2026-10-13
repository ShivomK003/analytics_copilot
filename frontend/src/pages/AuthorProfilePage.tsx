import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import {
  Link,
  useLocation,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ExternalLink,
  FileText,
  Layers,
  UserRound,
} from "lucide-react";

import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { Card } from "../components/ui/Card";

import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";

import {
  useAuthorDetails,
  useAuthorTopics,
  useAuthorPapers,
} from "../hooks/useAuthors";

import type { AuthorPaperItem } from "../types/dashboard";

const PAPERS_PER_PAGE = 10;

export function AuthorProfilePage() {
  const { authorId: authorIdParam } = useParams<{
    authorId: string;
  }>();

  const location = useLocation();

  const navigationState = location.state as {
    returnTo?: string;
  } | null;

  const returnTo =
    navigationState?.returnTo?.startsWith("/authors")
      ? navigationState.returnTo
      : "/authors";

  const parsedAuthorId = Number(authorIdParam);

  const authorId =
    Number.isSafeInteger(parsedAuthorId) && parsedAuthorId > 0
      ? parsedAuthorId
      : null;

  const [selectedTopic, setSelectedTopic] = useState("");
  const [paperPage, setPaperPage] = useState(1);

  const authorQuery = useAuthorDetails(authorId);
  const topicsQuery = useAuthorTopics(authorId);

  const papersQuery = useAuthorPapers({
    authorId: authorId ?? 0,
    topic: selectedTopic || undefined,
    limit: PAPERS_PER_PAGE + 1,
    offset: (paperPage - 1) * PAPERS_PER_PAGE,
  });

  const author = authorQuery.data;
  const topics = topicsQuery.data ?? [];

  const sortedTopics = [...topics].sort(
    (a, b) => b.paper_count - a.paper_count,
  );

  const maxTopicPapers = Math.max(
    1,
    ...sortedTopics.map((topic) => topic.paper_count),
  );

  const fetchedPapers = papersQuery.data ?? [];
  const papers = fetchedPapers.slice(0, PAPERS_PER_PAGE);

  const hasNextPage = fetchedPapers.length > PAPERS_PER_PAGE;
  const hasPreviousPage = paperPage > 1;

  useEffect(() => {
    setSelectedTopic("");
    setPaperPage(1);
  }, [authorId]);

  function handleTopicChange(topic: string) {
    setSelectedTopic(topic);
    setPaperPage(1);
  }

  function handlePreviousPage() {
    setPaperPage((page) => Math.max(1, page - 1));
  }

  function handleNextPage() {
    if (hasNextPage) {
      setPaperPage((page) => page + 1);
    }
  }

  if (authorId === null) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />

        <EmptyState
          title="Invalid researcher ID"
          description="The requested researcher ID is not valid."
        />
      </PageContainer>
    );
  }

  if (authorQuery.isPending) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />

        <div className="chart-shell" role="status">
          Loading researcher profile...
        </div>
      </PageContainer>
    );
  }

  if (authorQuery.isError) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />

        <ErrorState
          title="Unable to load researcher profile"
          description={
            authorQuery.error instanceof Error
              ? authorQuery.error.message
              : "The researcher could not be retrieved."
          }
          onRetry={() => void authorQuery.refetch()}
          retryLabel="Retry profile"
        />
      </PageContainer>
    );
  }

  if (!author) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />

        <EmptyState
          title="Researcher not found"
          description="No indexed researcher matches this ID."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BackLink to={returnTo} />

      <PageHeader
        title={author.author_name}
        description="Researcher profile, topic specialization, and indexed arXiv publications."
      />

      {/* Researcher overview */}
      <PageSection
        eyebrow="Researcher intelligence"
        title="Researcher Overview"
        description="Publication activity and research breadth within the indexed dataset."
      >
        <div style={metricsGridStyle}>
          <MetricCard
            label="Indexed Publications"
            value={author.paper_count.toLocaleString()}
            icon={<BookOpen size={19} />}
          />

          <MetricCard
            label="Research Topics"
            value={author.distinct_topic_count.toLocaleString()}
            icon={<Layers size={19} />}
          />

          <MetricCard
            label="Research Categories"
            value={author.distinct_category_count.toLocaleString()}
            icon={<UserRound size={19} />}
          />

          <MetricCard
            label="Latest Publication"
            value={formatDate(author.latest_publication_date)}
            icon={<CalendarDays size={19} />}
          />
        </div>
      </PageSection>

      {/* Research specialization */}
      <PageSection
        eyebrow="Research interests"
        title="Research Specialization"
        description="Topics ranked by the number of indexed publications associated with this author."
      >
        <Card
          eyebrow="Topic distribution"
          title="Primary Research Areas"
          description="Publication counts may overlap because a paper can belong to multiple topics."
          icon={<Layers size={18} />}
          tone="accent"
        >
          {topicsQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading research topics...
            </div>
          ) : topicsQuery.isError ? (
            <ErrorState
              title="Unable to load research topics"
              description={
                topicsQuery.error instanceof Error
                  ? topicsQuery.error.message
                  : "An unexpected error occurred."
              }
              onRetry={() => void topicsQuery.refetch()}
              retryLabel="Retry topics"
            />
          ) : sortedTopics.length === 0 ? (
            <EmptyState
              title="No research topics found"
              description="No topic specialization data is available for this author."
            />
          ) : (
            <div style={topicListStyle}>
              {sortedTopics.map((topic) => {
                const percentage =
                  (topic.paper_count / maxTopicPapers) * 100;

                return (
                  <div
                    key={topic.topic_id}
                    style={topicRowStyle}
                  >
                    <div style={topicLabelStyle}>
                      {topic.topic_name}
                    </div>

                    <div style={topicTrackStyle}>
                      <div
                        style={{
                          ...topicFillStyle,
                          width: `${percentage}%`,
                        }}
                      />
                    </div>

                    <div style={topicCountStyle}>
                      {topic.paper_count}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </PageSection>

      {/* Publications */}
      <PageSection
        eyebrow="Academic publications"
        title="Publications Explorer"
        description="Browse indexed publications, filter by research topic, and read paper abstracts."
      >
        <Card
          eyebrow="Research output"
          title="Indexed Publications"
          description="Explore this author's papers in the indexed arXiv dataset."
          icon={<FileText size={18} />}
          tone="accent"
        >
          <div style={publicationControlsStyle}>
            <label
              htmlFor="publication-topic-filter"
              style={labelStyle}
            >
              Filter by topic
            </label>

            <select
              id="publication-topic-filter"
              value={selectedTopic}
              onChange={(event) =>
                handleTopicChange(event.target.value)
              }
              style={selectStyle}
            >
              <option value="">All topics</option>

              {sortedTopics.map((topic) => (
                <option
                  key={topic.topic_id}
                  value={topic.topic_name}
                >
                  {topic.topic_name}
                </option>
              ))}
            </select>

            {selectedTopic && (
              <button
                type="button"
                onClick={() => handleTopicChange("")}
                style={secondaryButtonStyle}
              >
                Clear filter
              </button>
            )}
          </div>

          {papersQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading publications...
            </div>
          ) : papersQuery.isError ? (
            <ErrorState
              title="Unable to load publications"
              description={
                papersQuery.error instanceof Error
                  ? papersQuery.error.message
                  : "An unexpected error occurred."
              }
              onRetry={() => void papersQuery.refetch()}
              retryLabel="Retry publications"
            />
          ) : papers.length === 0 ? (
            <EmptyState
              title="No publications found"
              description="No indexed publications match the selected topic."
            />
          ) : (
            <>
              <div style={publicationListStyle}>
                {papers.map((paper) => (
                  <PublicationCard
                    key={paper.paper_id}
                    paper={paper}
                  />
                ))}
              </div>

              <div style={paginationStyle}>
                <button
                  type="button"
                  onClick={handlePreviousPage}
                  disabled={
                    !hasPreviousPage || papersQuery.isFetching
                  }
                  style={{
                    ...secondaryButtonStyle,
                    opacity: hasPreviousPage ? 1 : 0.4,
                  }}
                >
                  Previous
                </button>

                <span style={pageLabelStyle}>
                  Page {paperPage}
                </span>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={
                    !hasNextPage || papersQuery.isFetching
                  }
                  style={{
                    ...secondaryButtonStyle,
                    opacity: hasNextPage ? 1 : 0.4,
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </Card>
      </PageSection>

      <p style={datasetNoteStyle}>
        Researcher records are derived from author names in the indexed
        arXiv dataset. Names may not uniquely identify individuals, and
        publication counts do not represent complete academic histories.
      </p>
    </PageContainer>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} style={backLinkStyle}>
      <ArrowLeft size={16} />
      Back to Researcher Search
    </Link>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={metricCardStyle}>
      <div style={metricHeaderStyle}>
        {icon}
        <span>{label}</span>
      </div>

      <div style={metricValueStyle}>
        {value}
      </div>
    </div>
  );
}

function PublicationCard({
  paper,
}: {
  paper: AuthorPaperItem;
}) {
  const [showAbstract, setShowAbstract] = useState(false);

  return (
    <article style={publicationCardStyle}>
      <h3 style={paperTitleStyle}>
        {paper.title}
      </h3>

      <div style={paperMetadataStyle}>
        {paper.primary_category && (
          <span>{paper.primary_category}</span>
        )}

        {paper.published_date && (
          <span>
            Published {formatDate(paper.published_date)}
          </span>
        )}
      </div>

      {paper.topics.length > 0 && (
        <div style={tagsContainerStyle}>
          {paper.topics.map((topic) => (
            <span key={topic} style={topicTagStyle}>
              {topic}
            </span>
          ))}
        </div>
      )}

      {showAbstract && (
        <div style={abstractStyle}>
          {paper.abstract?.trim() ||
            "No abstract is available for this publication."}
        </div>
      )}

      <div style={paperActionsStyle}>
        <button
          type="button"
          onClick={() =>
            setShowAbstract((previous) => !previous)
          }
          aria-expanded={showAbstract}
          style={textButtonStyle}
        >
          {showAbstract ? "Hide Abstract" : "Read Abstract"}
        </button>

        {paper.arxiv_url && (
          <a
            href={paper.arxiv_url}
            target="_blank"
            rel="noopener noreferrer"
            style={externalLinkStyle}
          >
            arXiv
            <ExternalLink size={13} />
          </a>
        )}

        {paper.pdf_url && (
          <a
            href={paper.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={externalLinkStyle}
          >
            PDF
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </article>
  );
}

function formatDate(date: string | null): string {
  if (!date) return "Unavailable";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Shared styles

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 24,
  color: "var(--color-accent)",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 500,
};

const metricsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
};

const metricCardStyle: CSSProperties = {
  padding: 20,
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  background: "var(--color-surface)",
};

const metricHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "var(--color-text-secondary)",
  fontSize: 13,
  marginBottom: 14,
};

const metricValueStyle: CSSProperties = {
  fontSize: 25,
  fontWeight: 700,
  color: "var(--color-text-primary)",
};

const topicListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
  padding: "8px 0",
};

const topicRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(100px, 150px) minmax(0, 1fr) 45px",
  alignItems: "center",
  gap: 14,
};

const topicLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text-primary)",
  overflowWrap: "anywhere",
};

const topicTrackStyle: CSSProperties = {
  width: "100%",
  height: 11,
  background: "var(--color-border)",
  borderRadius: 6,
  overflow: "hidden",
};

const topicFillStyle: CSSProperties = {
  height: "100%",
  background: "var(--color-accent)",
  borderRadius: 6,
};

const topicCountStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  textAlign: "right",
  color: "var(--color-text-primary)",
};

const publicationControlsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 24,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
};

const selectStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  fontSize: 13,
  minWidth: 160,
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

const publicationListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const publicationCardStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: 20,
  background: "var(--color-surface)",
};

const paperTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
  color: "var(--color-text-primary)",
};

const paperMetadataStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 12,
  fontSize: 12,
  color: "var(--color-text-secondary)",
};

const tagsContainerStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 16,
};

const topicTagStyle: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 6,
  background: "var(--color-border)",
  color: "var(--color-text-primary)",
  fontSize: 11,
  fontWeight: 500,
};

const abstractStyle: CSSProperties = {
  padding: 16,
  marginBottom: 16,
  borderRadius: 8,
  background: "var(--color-background, var(--color-surface))",
  border: "1px solid var(--color-border)",
  color: "var(--color-text-secondary)",
  fontSize: 13,
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
};

const paperActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 18,
};

const textButtonStyle: CSSProperties = {
  padding: 0,
  border: "none",
  background: "transparent",
  color: "var(--color-accent)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const externalLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  color: "var(--color-accent)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 500,
};

const paginationStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 24,
};

const pageLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--color-text-secondary)",
};

const datasetNoteStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  color: "var(--color-text-secondary)",
  marginTop: 24,
};