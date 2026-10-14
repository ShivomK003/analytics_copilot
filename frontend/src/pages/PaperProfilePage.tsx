import type { CSSProperties } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ExternalLink,
  FileText,
  Layers,
  Users,
} from "lucide-react";

import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/feedback/EmptyState";
import { ErrorState } from "../components/feedback/ErrorState";

import {
  usePaperDetails,
  usePaperAuthors,
  useRelatedPapers,
} from "../hooks/usePapers";

function formatDate(value: string | null): string {
  if (!value) return "Unavailable";
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

export function PaperProfilePage() {
  const { paperId } = useParams<{ paperId: string }>();
  const location = useLocation();

  const navigationState = location.state as {
    returnTo?: string;
  } | null;

  const returnTo =
    navigationState?.returnTo?.startsWith("/papers")
      ? navigationState.returnTo
      : "/papers";

  const id = paperId || null;

  const paperQuery = usePaperDetails(id);
  const authorsQuery = usePaperAuthors(id);
  const relatedQuery = useRelatedPapers(id, 6);

  const paper = paperQuery.data;

  if (!id) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />
        <EmptyState
          title="Invalid paper ID"
          description="The requested paper ID is missing."
        />
      </PageContainer>
    );
  }

  if (paperQuery.isPending) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />
        <div className="chart-shell" role="status">
          Loading publication...
        </div>
      </PageContainer>
    );
  }

  if (paperQuery.isError) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />
        <ErrorState
          title="Unable to load publication"
          description={
            paperQuery.error instanceof Error
              ? paperQuery.error.message
              : "The publication could not be retrieved."
          }
          onRetry={() => void paperQuery.refetch()}
          retryLabel="Retry publication"
        />
      </PageContainer>
    );
  }

  if (!paper) {
    return (
      <PageContainer>
        <BackLink to={returnTo} />
        <EmptyState
          title="Publication not found"
          description="No indexed paper matches this ID."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BackLink to={returnTo} />

      <PageHeader
        title={paper.title}
        description={`arXiv ${paper.paper_id} · ${formatDate(
          paper.published_date,
        )}`}
      />

      <PageSection
        eyebrow="Publication intelligence"
        title="Paper Overview"
        description="Publication metadata and external research resources."
      >
        <div style={metricsGridStyle}>
          <Metric
            icon={<BookOpen size={18} />}
            label="arXiv ID"
            value={paper.paper_id}
          />
          <Metric
            icon={<CalendarDays size={18} />}
            label="Published"
            value={formatDate(paper.published_date)}
          />
          <Metric
            icon={<Layers size={18} />}
            label="Primary Category"
            value={paper.primary_category || "Unavailable"}
          />
          <Metric
            icon={<FileText size={18} />}
            label="Last Updated"
            value={formatDate(paper.updated_date)}
          />
        </div>

        <div style={externalActionsStyle}>
          {paper.arxiv_url && (
            <a
              href={paper.arxiv_url}
              target="_blank"
              rel="noopener noreferrer"
              style={externalButtonStyle}
            >
              View on arXiv <ExternalLink size={15} />
            </a>
          )}

          {paper.pdf_url && (
            <a
              href={paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={secondaryExternalStyle}
            >
              Open PDF <ExternalLink size={15} />
            </a>
          )}
        </div>
      </PageSection>

      <PageSection
        eyebrow="Research summary"
        title="Abstract"
        description="The publication's abstract as indexed from arXiv."
      >
        <Card
          eyebrow="Paper content"
          title="Research Abstract"
          icon={<FileText size={18} />}
          tone="accent"
        >
          <p style={abstractStyle}>
            {paper.abstract?.trim() || "No abstract is available."}
          </p>
        </Card>
      </PageSection>

      <PageSection
        eyebrow="Research classification"
        title="Topics & Categories"
        description="Research areas and arXiv subject classifications associated with this publication."
      >
        <div style={classificationGridStyle}>
          <Card
            eyebrow="Research areas"
            title="Topics"
            icon={<Layers size={18} />}
            tone="accent"
          >
            <TagList
              values={paper.topics}
              emptyText="No topics assigned."
            />
          </Card>

          <Card
            eyebrow="arXiv taxonomy"
            title="Categories"
            icon={<BookOpen size={18} />}
          >
            <TagList
              values={paper.categories}
              emptyText="No categories assigned."
            />
          </Card>
        </div>
      </PageSection>

      <PageSection
        eyebrow="Research contributors"
        title="Authors"
        description="Explore the indexed researcher profiles associated with this publication."
      >
        <Card
          eyebrow="Contributors"
          title="Paper Authors"
          icon={<Users size={18} />}
          tone="accent"
        >
          {authorsQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading authors...
            </div>
          ) : authorsQuery.isError ? (
            <ErrorState
              title="Unable to retrieve authors"
              description={
                authorsQuery.error instanceof Error
                  ? authorsQuery.error.message
                  : "An unexpected error occurred."
              }
              onRetry={() => void authorsQuery.refetch()}
              retryLabel="Retry authors"
            />
          ) : (authorsQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No authors found"
              description="No author records are associated with this paper."
            />
          ) : (
            <div style={linkListStyle}>
              {authorsQuery.data!.map((author) => (
                <Link
                  key={author.author_id}
                  to={`/authors/${author.author_id}`}
                  style={listLinkStyle}
                >
                  <span>{author.author_name}</span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </PageSection>

      <PageSection
        eyebrow="Research discovery"
        title="Related Publications"
        description="Papers ranked by the number of research topics they share with this publication."
      >
        <Card
          eyebrow="Related research"
          title="Explore Similar Papers"
          description="Topic overlap provides a simple, explainable measure of research similarity."
          icon={<BookOpen size={18} />}
          tone="accent"
        >
          {relatedQuery.isPending ? (
            <div className="chart-shell" role="status">
              Loading related publications...
            </div>
          ) : relatedQuery.isError ? (
            <ErrorState
              title="Unable to retrieve related papers"
              description={
                relatedQuery.error instanceof Error
                  ? relatedQuery.error.message
                  : "An unexpected error occurred."
              }
              onRetry={() => void relatedQuery.refetch()}
              retryLabel="Retry related papers"
            />
          ) : (relatedQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No related publications found"
              description="No papers share the indexed research topics of this publication."
            />
          ) : (
            <div style={relatedListStyle}>
              {relatedQuery.data!.map((related) => (
                <Link
                  key={related.paper_id}
                  to={`/papers/${encodeURIComponent(related.paper_id)}`}
                  state={{ returnTo }}
                  style={relatedPaperStyle}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={relatedTitleStyle}>
                      {related.title}
                    </div>

                    <div style={relatedMetadataStyle}>
                      {formatDate(related.published_date)}
                      {" · "}
                      {related.shared_topic_count} shared{" "}
                      {related.shared_topic_count === 1
                        ? "topic"
                        : "topics"}
                    </div>
                  </div>

                  <ArrowRight size={17} style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </PageSection>
    </PageContainer>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} style={backLinkStyle}>
      <ArrowLeft size={16} />
      Back to Paper Search
    </Link>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function TagList({
  values,
  emptyText,
}: {
  values: string[];
  emptyText: string;
}) {
  if (values.length === 0) {
    return <p style={mutedStyle}>{emptyText}</p>;
  }

  return (
    <div style={tagsStyle}>
      {values.map((value) => (
        <span key={value} style={tagStyle}>
          {value}
        </span>
      ))}
    </div>
  );
}

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

const metricStyle: CSSProperties = {
  padding: 20,
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  background: "var(--color-surface)",
};

const metricLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 14,
  color: "var(--color-text-secondary)",
  fontSize: 13,
};

const metricValueStyle: CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  color: "var(--color-text-primary)",
  overflowWrap: "anywhere",
};

const externalActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginTop: 20,
};

const externalButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 16px",
  borderRadius: 8,
  background: "var(--color-accent)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};

const secondaryExternalStyle: CSSProperties = {
  ...externalButtonStyle,
  background: "var(--color-surface)",
  color: "var(--color-accent)",
  border: "1px solid var(--color-border)",
};

const abstractStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.8,
  whiteSpace: "pre-wrap",
  color: "var(--color-text-primary)",
};

const classificationGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 16,
};

const tagsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const tagStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "var(--color-border)",
  color: "var(--color-text-primary)",
  fontSize: 12,
  fontWeight: 500,
};

const mutedStyle: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: 13,
};

const linkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const listLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "13px 16px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 500,
};

const relatedListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const relatedPaperStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "16px 18px",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  textDecoration: "none",
  color: "var(--color-text-secondary)",
};

const relatedTitleStyle: CSSProperties = {
  color: "var(--color-text-primary)",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.5,
  marginBottom: 7,
};

const relatedMetadataStyle: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: 12,
};

const datasetNoteStyle: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: 12,
  lineHeight: 1.6,
};