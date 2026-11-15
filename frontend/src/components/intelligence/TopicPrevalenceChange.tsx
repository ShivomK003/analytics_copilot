import { IntelligenceChartHeader } from "./IntelligenceChartHeader";
import type { IntelligenceChartHeading } from "./IntelligenceChartHeader";
import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError } from "../../api/client";
import { useIntelligenceComposition, useIntelligenceMatrix } from "../../hooks/useIntelligence";
import type { MomentumMatrixData } from "../../types/intelligence";
import type { CompositionSelection } from "../../utils/compositionData";
import { formatPrevalence } from "../../utils/compositionData";
import type { ResolvedDates } from "../../utils/intelligenceFilters";
import { validateCustomDates } from "../../utils/intelligenceFilters";
import { matrixWindowDates } from "../../utils/matrixData";
import type { MatrixWindowKind } from "../../utils/matrixData";
import {
  formatPercentagePoints,
  formatPrevalenceTick,
  prevalenceAxisTicks,
  prevalenceChanges,
  prevalenceSelection,
} from "../../utils/prevalenceData";
import type { PrevalenceChangeRow, PrevalenceSelection } from "../../utils/prevalenceData";
import { topicColor } from "../../utils/topicColors";
import { ResearchComposition } from "./ResearchComposition";
import { IntelligenceEmpty, IntelligenceError, IntelligenceLoading } from "./IntelligenceState";

function PrevalenceDetails({
  row,
  windows,
}: {
  row: PrevalenceChangeRow;
  windows: MomentumMatrixData;
}) {
  return (
    <div className="prevalence-details">
      <strong>
        <span
          className="topic-swatch"
          aria-hidden="true"
          style={{ background: topicColor(row.topicId) }}
        />
        {row.topicName}
      </strong>
      <strong>{formatPercentagePoints(row.change)}</strong>
      <dl>
        {(
          [
            ["Previous", row.previous, windows.previous_window],
            ["Current", row.current, windows.recent_window],
          ] as const
        ).map(([label, period, window]) => (
          <div key={label}>
            <dt>{label} prevalence</dt>
            {window ? (
              <dd>
                {matrixWindowDates(window).dateFrom} – {matrixWindowDates(window).dateTo} · UTC
              </dd>
            ) : null}
            <dd>{formatPrevalence(period.prevalence)}</dd>
            <dd>
              {period.topicPapers?.toLocaleString() ?? "Unavailable"} topic /{" "}
              {period.totalPapers?.toLocaleString() ?? "unavailable"} corpus papers
            </dd>
          </div>
        ))}
      </dl>
      {row.change === null ? (
        <p>
          Comparison unavailable: a complete observation or nonzero corpus denominator is missing.
        </p>
      ) : null}
    </div>
  );
}

function PrevalenceVisualization({
  rows,
  windows,
  onSelectWindow,
}: {
  rows: PrevalenceChangeRow[];
  windows: MomentumMatrixData;
  onSelectWindow?: (selection: PrevalenceSelection) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<MatrixWindowKind | null>(null);
  const previous = windows.previous_window!;
  const current = windows.recent_window!;
  const available = rows.filter((row) => row.change !== null);
  const selected = rows.find((row) => row.topicId === activeId);
  const largestChange = Math.max(0, ...available.map((row) => Math.abs(row.change!)));
  const extent = largestChange > 0 ? largestChange * 1.15 : 1;
  const ticks = prevalenceAxisTicks(extent);
  const tickStep = ticks[1] - ticks[0];
  function inspect(topicId: number, window: MatrixWindowKind) {
    setSelectedWindow(window);
    const selection = prevalenceSelection(windows, topicId, window);
    if (selection) onSelectWindow?.(selection);
  }
  return (
    <>
      <div className="matrix-windows" aria-label="Prevalence comparison windows">
        <p>
          <strong>Previous</strong>
          {matrixWindowDates(previous).dateFrom} – {matrixWindowDates(previous).dateTo}
        </p>
        <p>
          <strong>Current</strong>
          {matrixWindowDates(current).dateFrom} – {matrixWindowDates(current).dateTo}
        </p>
        <span>Inclusive UTC · {windows.window_weeks} complete weeks each</span>
      </div>
      {available.length ? (
        <div
          className="prevalence-chart"
          style={{ height: Math.max(230, available.length * 42 + 50) }}
          role="group"
          aria-label="Topic prevalence change in percentage points; inspect topics using the buttons below"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={available}
              margin={{ top: 12, right: 70, bottom: 8, left: 8 }}
              accessibilityLayer
            >
              <CartesianGrid stroke="var(--color-border)" horizontal={false} />
              <XAxis
                type="number"
                domain={[ticks[0], ticks[ticks.length - 1]]}
                ticks={ticks}
                minTickGap={18}
                tickFormatter={(value: number) => formatPrevalenceTick(value, tickStep)}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="topicName"
                width={100}
                tickFormatter={(value: string) =>
                  value.length > 14 ? `${value.slice(0, 13)}…` : value
                }
                tick={{ fontSize: 12 }}
              />
              <ReferenceLine x={0} stroke="var(--color-text-secondary)" strokeWidth={1.5} />
              <Tooltip
                wrapperStyle={{ maxWidth: "min(24rem, 85vw)", zIndex: 10 }}
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="momentum-tooltip">
                      <PrevalenceDetails
                        row={payload[0].payload as PrevalenceChangeRow}
                        windows={windows}
                      />
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="change"
                isAnimationActive={false}
                maxBarSize={22}
                onClick={(row) => setActiveId((row as unknown as PrevalenceChangeRow).topicId)}
              >
                {available.map((row) => (
                  <Cell
                    key={row.topicId}
                    fill={
                      row.change! < 0
                        ? "var(--color-prevalence-negative)"
                        : "var(--color-prevalence-positive)"
                    }
                    opacity={activeId === null || activeId === row.topicId ? 1 : 0.4}
                  />
                ))}
                <LabelList
                  dataKey="change"
                  position="right"
                  formatter={(value) =>
                    formatPercentagePoints(typeof value === "number" ? value : null)
                  }
                  fill="var(--color-text-primary)"
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <IntelligenceEmpty
          title="Prevalence values unavailable"
          description="Both windows need observed counts and a nonzero corpus denominator. Counts remain available below."
        />
      )}
      <p className="chart-caption">
        Blue-violet: gaining · Orange: losing · 0 pp: unchanged. Sorted by change; unavailable
        topics last.
      </p>
      <div className="prevalence-topic-list" aria-label="Inspect prevalence changes">
        {rows.map((row) => (
          <button
            className="matrix-topic-button"
            key={row.topicId}
            type="button"
            aria-label={`${row.topicName} ${formatPercentagePoints(row.change)}`}
            aria-pressed={activeId === row.topicId}
            onClick={() => setActiveId(row.topicId)}
          >
            <span
              className="topic-swatch"
              aria-hidden="true"
              style={{ background: topicColor(row.topicId) }}
            />
            {row.topicName}
            <strong>{formatPercentagePoints(row.change)}</strong>
          </button>
        ))}
      </div>
      {selected ? (
        <div className="prevalence-inspector" role="status">
          <PrevalenceDetails row={selected} windows={windows} />
          {selectedWindow ? (
            <p className="chart-caption">
              Inspecting {selected.topicName} ·{" "}
              {selectedWindow === "recent" ? "current" : "previous"} window · inclusive UTC dates
              shown above.
            </p>
          ) : null}
          <div className="matrix-window-actions">
            <button
              type="button"
              className="button button-secondary"
              aria-pressed={selectedWindow === "previous"}
              onClick={() => inspect(selected.topicId, "previous")}
            >
              Inspect previous window
            </button>
            <button
              type="button"
              className="button button-secondary"
              aria-pressed={selectedWindow === "recent"}
              onClick={() => inspect(selected.topicId, "recent")}
            >
              Inspect current window
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setActiveId(null)}
            >
              Clear prevalence selection
            </button>
          </div>
        </div>
      ) : null}
      <details>
        <summary>Comparison values and denominators</summary>
        <div className="momentum-table">
          <table>
            <caption>
              Period prevalence uses summed counts, not averaged weekly percentages.
            </caption>
            <thead>
              <tr>
                <th>Topic</th>
                <th>Previous topic / corpus papers</th>
                <th>Previous prevalence</th>
                <th>Current topic / corpus papers</th>
                <th>Current prevalence</th>
                <th>Change (pp)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.topicId}>
                  <th scope="row">{row.topicName}</th>
                  <td>
                    {row.previous.topicPapers ?? "Unavailable"} /{" "}
                    {row.previous.totalPapers ?? "Unavailable"}
                  </td>
                  <td>{formatPrevalence(row.previous.prevalence)}</td>
                  <td>
                    {row.current.topicPapers ?? "Unavailable"} /{" "}
                    {row.current.totalPapers ?? "Unavailable"}
                  </td>
                  <td>{formatPrevalence(row.current.prevalence)}</td>
                  <td>{formatPercentagePoints(row.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function TopicPrevalenceChange({
  heading,
  dates,
  topicIds,
  topicsReady,
  onSelectWindow,
  onSelectPoint,
}: {
  heading?: IntelligenceChartHeading;
  dates: ResolvedDates;
  topicIds: readonly number[];
  topicsReady: boolean;
  onSelectWindow?: (selection: PrevalenceSelection) => void;
  onSelectPoint?: (selection: CompositionSelection) => void;
}) {
  const [windowWeeks, setWindowWeeks] = useState(4);
  const [showWeekly, setShowWeekly] = useState(false);
  const selectorId = useId();
  const dateError =
    dates.error ??
    (dates.date_from && dates.date_to
      ? validateCustomDates(dates.date_from, dates.date_to)
      : "Choose a resolved UTC date range.");
  const ready = topicsReady && !dateError;
  const matrix = useIntelligenceMatrix(
    {
      date_from: dates.date_from,
      date_to: dates.date_to,
      topic_ids: topicIds,
      window_weeks: windowWeeks,
    },
    ready,
  );
  const windows = matrix.data?.data;
  const previous = windows?.previous_window;
  const current = windows?.recent_window;
  const comparisonDates =
    previous && current
      ? {
          date_from: matrixWindowDates(previous).dateFrom,
          date_to: matrixWindowDates(current).dateTo,
        }
      : {};
  const composition = useIntelligenceComposition(
    { ...comparisonDates, topic_ids: topicIds, include_partial_weeks: false },
    ready && !matrix.error && !!previous && !!current,
  );
  const rows = windows && composition.data ? prevalenceChanges(composition.data.data, windows) : [];
  const shortRange =
    matrix.error instanceof ApiError &&
    matrix.error.status === 422 &&
    /both complete comparison windows/.test(matrix.error.message);
  const error = matrix.error ?? composition.error;
  let content;
  if (dateError || !topicsReady) {
    content = (
      <IntelligenceEmpty
        title="Choose a valid prevalence comparison"
        description={dateError ?? "Research topics must be available."}
      />
    );
  } else if (shortRange) {
    content = (
      <IntelligenceEmpty
        title="More complete weeks needed"
        description={`Choose a range containing two ${windowWeeks}-week windows, or fewer weeks per window. Partial weeks and the current incomplete UTC week are excluded.`}
      />
    );
  } else if (error) {
    content = (
      <IntelligenceError
        key={`${matrix.errorUpdatedAt}/${composition.errorUpdatedAt}`}
        error={error}
        label="prevalence comparison"
        onRetry={() => void (matrix.error ? matrix.refetch() : composition.refetch())}
      />
    );
  } else if (matrix.isPending || (previous && current && composition.isPending)) {
    content = <IntelligenceLoading label="Loading topic prevalence comparison…" />;
  } else if (!previous || !current || !rows.length) {
    content = (
      <IntelligenceEmpty
        title="Prevalence comparison unavailable"
        description="No comparable complete windows or topic observations were returned for this range."
      />
    );
  } else {
    content = (
      <PrevalenceVisualization
        key={`${dates.date_from}/${dates.date_to}/${topicIds.join(",")}/${windowWeeks}`}
        rows={rows}
        windows={windows!}
        onSelectWindow={onSelectWindow}
      />
    );
  }
  const warnings = [
    ...new Set([...(matrix.data?.meta.warnings ?? []), ...(composition.data?.meta.warnings ?? [])]),
  ];
  return (
    <div className="prevalence-change">
      <IntelligenceChartHeader heading={heading}>
        <div className="matrix-toolbar">
          <label htmlFor={selectorId}>
            Prevalence weeks per window
            <select
              id={selectorId}
              className="form-control"
              value={windowWeeks}
              onChange={(event) => {
                setWindowWeeks(Number(event.target.value));
              }}
            >
              {Array.from({ length: 11 }, (_, i) => i + 2).map((weeks) => (
                <option key={weeks} value={weeks}>
                  {weeks} weeks
                </option>
              ))}
            </select>
          </label>
        </div>
      </IntelligenceChartHeader>
      {(matrix.isFetching && !matrix.isPending) ||
      (composition.isFetching && !composition.isPending) ? (
        <p role="status">Updating prevalence comparison…</p>
      ) : null}
      {content}
      <details className="methodology-disclosure">
        <summary>How to read prevalence change</summary>
        <div className="disclosure-content">
          <p>
            Each window's prevalence is 100 × distinct topic papers / all distinct indexed papers
            published in that window. Disjoint full UTC weeks are summed before dividing; weekly
            percentages are never averaged. The denominator includes untagged papers and papers
            outside selected topics.
          </p>
          <p>
            Windows follow Momentum Matrix: adjacent, equal Monday-based weeks, excluding partial
            boundaries and the current incomplete week. Missing weeks or topic observations remain
            unavailable. A zero corpus denominator has no prevalence; a zero topic count with a
            nonzero denominator is 0%.
          </p>
          <p>
            Topics overlap and percentages need not sum to 100%. Calendar completeness does not
            verify ingestion completeness. Changes describe relative indexed publication activity,
            not research impact. Endpoint responses refresh independently; this is not a
            transaction-consistent snapshot.
          </p>
          {warnings.length ? (
            <ul className="intelligence-warnings" aria-label="Prevalence warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
      <details
        className="weekly-prevalence-detail"
        onToggle={(event) => setShowWeekly(event.currentTarget.open)}
      >
        <summary>View weekly prevalence trends</summary>
        {showWeekly ? (
          <ResearchComposition
            dates={dates}
            topicIds={topicIds}
            topicsReady={topicsReady}
            onSelectPoint={onSelectPoint}
          />
        ) : null}
      </details>
    </div>
  );
}
