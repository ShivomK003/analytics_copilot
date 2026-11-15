import { Link } from "react-router-dom";
import type { EvidenceRecord } from "../../types/intelligence";
import "../../styles/paperDiscovery.css";

export type DiscoveryPaper = Pick<
  EvidenceRecord,
  "paper_id" | "title" | "abstract" | "primary_category" | "arxiv_url"
> & {
  published_date: string | null;
  authors?: string[];
  topics?: string[];
  categories?: string[];
};
export function PaperResults({ papers, returnTo }: { papers: DiscoveryPaper[]; returnTo: string }) {
  return (
    <ul className="paper-results" aria-label="Publication results">
      {papers.map((paper) => (
        <li key={paper.paper_id} className="paper-result">
          <h3>
            <Link
              to={`/papers/${encodeURIComponent(paper.paper_id)}?${new URLSearchParams({ return_to: returnTo })}`}
              state={{ returnTo }}
            >
              {paper.title}
            </Link>
          </h3>
          {paper.authors?.length ? (
            <p className="paper-authors">{paper.authors.join(", ")}</p>
          ) : null}
          <p className="paper-metadata">
            {paper.published_date ? (
              <time dateTime={paper.published_date}>
                {new Date(paper.published_date).toLocaleDateString("en-GB", {
                  timeZone: "UTC",
                  dateStyle: "medium",
                })}{" "}
                UTC
              </time>
            ) : (
              "Publication date unavailable"
            )}
            {paper.primary_category ? ` · Primary category: ${paper.primary_category}` : ""}
            {paper.categories?.length ? ` · Categories: ${paper.categories.join(", ")}` : ""}
          </p>
          {paper.abstract ? <p className="paper-abstract">{paper.abstract}</p> : null}
          {paper.topics?.length ? (
            <ul className="paper-topic-tags" aria-label="Assigned topics">
              {paper.topics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          ) : null}
          <div className="paper-links">
            <Link
              to={`/papers/${encodeURIComponent(paper.paper_id)}?${new URLSearchParams({ return_to: returnTo })}`}
              state={{ returnTo }}
            >
              Paper details
            </Link>
            {paper.arxiv_url && /^https?:\/\//i.test(paper.arxiv_url) ? (
              <a href={paper.arxiv_url} target="_blank" rel="noopener noreferrer">
                arXiv <span className="visually-hidden">(opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
export function PaperPagination({
  page,
  total,
  pageSize,
  hasMore,
  busy,
  onPageChange,
}: {
  page: number;
  total?: number;
  pageSize: number;
  hasMore?: boolean;
  busy: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination-toolbar" aria-label="Publication pages">
      <button
        type="button"
        className="button button-secondary"
        disabled={page <= 1 || busy}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <p role="status">
        Page {page}
        {totalPages === undefined ? "" : ` of ${totalPages}`}
        {total === undefined ? "" : ` · ${total.toLocaleString()} papers`}
      </p>
      <button
        type="button"
        className="button button-secondary"
        disabled={busy || !(hasMore ?? (totalPages !== undefined && page < totalPages))}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
