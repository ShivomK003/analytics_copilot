import type { CoverageData, IntelligenceResponse } from "../../types/intelligence";

import { IntelligenceEmpty, IntelligenceError, IntelligenceLoading } from "./IntelligenceState";

export interface CoverageSummaryProps {
  data?: IntelligenceResponse<CoverageData>;
  error: Error | null;
  isPending: boolean;
  isFetching: boolean;
  errorUpdatedAt?: number;
  onRetry: () => void;
}

export function CoverageSummary({
  data,
  error,
  isPending,
  isFetching,
  errorUpdatedAt,
  onRetry,
}: CoverageSummaryProps) {
  const coverage = data?.data;
  return (
    <section className="coverage-summary" aria-label="Data coverage & freshness">
      {isPending && !data ? <IntelligenceLoading label="Loading warehouse coverage…" /> : null}
      {error ? (
        <IntelligenceError
          key={errorUpdatedAt ?? error.message}
          error={error}
          label="coverage"
          onRetry={onRetry}
        />
      ) : null}
      {!isPending && !error && !coverage ? (
        <IntelligenceEmpty
          title="Coverage unavailable"
          description="Warehouse coverage information is not available."
        />
      ) : null}
      {coverage ? (
        <>
          {isFetching ? <p role="status">Refreshing coverage…</p> : null}
          {error ? <p role="status">Showing the last successfully fetched coverage.</p> : null}
          <p className="coverage-freshness">
            Last successful ETL (UTC):{" "}
            {coverage.latest_successful_etl_at ? (
              <time dateTime={coverage.latest_successful_etl_at}>
                {new Date(coverage.latest_successful_etl_at).toLocaleString("en-GB", {
                  timeZone: "UTC",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            ) : (
              "Unavailable"
            )}
          </p>
          {coverage.total_indexed_papers === 0 ? (
            <IntelligenceEmpty
              title="No indexed papers yet"
              description="Coverage will update when papers are available. Configured topics may still be selectable."
            />
          ) : null}
        </>
      ) : null}
      <details className="coverage-disclosure">
        <summary>
          Historical completeness: unknown <span>Coverage & methodology</span>
        </summary>
        <div className="disclosure-content">
          <p>
            Trends reflect indexed papers, not the entire global AI research landscape. Historical
            coverage is not guaranteed complete, even between observed dates.
          </p>
          <p>
            Topics are assigned automatically and may contain classification noise. Papers can
            belong to multiple topics, so topic totals can overlap.
          </p>
          {coverage ? (
            <p>
              Observed publication dates (UTC): {coverage.observed_date_from ?? "Unavailable"} –{" "}
              {coverage.observed_date_to ?? "Unavailable"}. Observed bounds do not establish
              continuous ingestion.
            </p>
          ) : null}
          {data?.meta.warnings.length ? (
            <ul className="intelligence-warnings" aria-label="Coverage warnings">
              {data.meta.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </section>
  );
}
