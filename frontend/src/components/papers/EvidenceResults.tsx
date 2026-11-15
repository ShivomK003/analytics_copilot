import { useIntelligenceEvidence } from "../../hooks/useIntelligence";
import {
  evidenceExplorerUrl,
  evidenceFilters,
  evidencePageSize,
  validateEvidenceContext,
} from "../../utils/evidenceContext";
import type { EvidenceContext, EvidenceRefinement } from "../../utils/evidenceContext";
import {
  IntelligenceEmpty,
  IntelligenceError,
  IntelligenceLoading,
} from "../intelligence/IntelligenceState";
import { PaperPagination, PaperResults } from "./PaperResults";

export function EvidenceResults({
  context,
  page,
  onPageChange,
  refinement = {},
}: {
  refinement?: EvidenceRefinement;
  context: EvidenceContext;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const invalid = validateEvidenceContext(context);
  const query = useIntelligenceEvidence(evidenceFilters(context, page, refinement), !invalid);
  if (invalid)
    return <IntelligenceEmpty title="Evidence context unavailable" description={invalid} />;
  if (query.isPending) return <IntelligenceLoading label="Loading supporting publications…" />;
  if (query.error)
    return (
      <IntelligenceError
        key={query.errorUpdatedAt}
        error={query.error}
        label="evidence"
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data?.data;
  if (!data)
    return (
      <IntelligenceEmpty
        title="Evidence unavailable"
        description="No evidence response is available."
      />
    );
  if ((refinement.q || refinement.sort) && data.supporting_total === undefined) {
    return (
      <IntelligenceEmpty
        title="Evidence refinement unavailable"
        description="Search or sorting is unavailable for this response. Clear search and choose Newest first to view the original supporting publications."
      />
    );
  }
  return (
    <div className="evidence-results">
      {query.isFetching ? <p role="status">Updating supporting publications…</p> : null}
      <p className="paper-result-count">
        {refinement.q
          ? data.supporting_total === undefined
            ? `${data.total.toLocaleString()} matching publications · original evidence count unavailable`
            : `${data.total.toLocaleString()} matching publications out of ${data.supporting_total.toLocaleString()} supporting indexed publications`
          : `${data.total.toLocaleString()} supporting indexed publications`}
      </p>
      {data.records.length ? (
        <PaperResults
          papers={data.records}
          returnTo={evidenceExplorerUrl(context, page, refinement)}
        />
      ) : (
        <IntelligenceEmpty
          title={
            data.total
              ? "No publications on this page"
              : refinement.q
                ? "No matching publications"
                : "No supporting publications found"
          }
          description="No indexed publications were returned for this selection and page. This does not establish an absence of research."
        />
      )}
      <PaperPagination
        page={page}
        total={data.total}
        pageSize={evidencePageSize}
        hasMore={data.has_more}
        busy={query.isFetching}
        onPageChange={onPageChange}
      />
      {page > 1 && !data.records.length ? (
        <button type="button" className="button button-secondary" onClick={() => onPageChange(1)}>
          Return to first page
        </button>
      ) : null}
      <details className="evidence-caveats">
        <summary>Coverage & evidence limitations</summary>
        <div className="disclosure-content">
          <p>
            Indexed publications are not a complete global research record. Historical completeness
            is unknown and automatic topic assignments may overlap or contain classification noise.
            Evidence uses publication dates, not ingestion timestamps.
          </p>
          <p>
            Results retain stored arXiv IDs, including separately stored versions. Authors are
            indexed names, not disambiguated identities. Pagination can shift as the warehouse
            changes.
          </p>
          <p>
            Results show primary category metadata; matching all-category evidence may come from a
            secondary assignment.
          </p>
          {query.data?.meta.warnings.length ? (
            <ul>
              {query.data.meta.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </div>
  );
}
