import { IntelligenceChartHeader } from "./IntelligenceChartHeader";
import type { IntelligenceChartHeading } from "./IntelligenceChartHeader";
import { useId, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIntelligenceMomentum } from "../../hooks/useIntelligence";
import type { MomentumData } from "../../types/intelligence";
import { validateCustomDates } from "../../utils/intelligenceFilters";
import type { ResolvedDates } from "../../utils/intelligenceFilters";
import { formatMomentumDate, momentumRows, momentumSelection } from "../../utils/momentumData";
import type { MomentumMode, MomentumRow, MomentumSelection } from "../../utils/momentumData";
import { topicColor } from "../../utils/topicColors";
import { IntelligenceEmpty, IntelligenceError, IntelligenceLoading } from "./IntelligenceState";

export function MomentumTooltip({ row, data }: { row: MomentumRow; data: MomentumData }) {
  const firstPoint = Object.values(row.points).find((point) => point !== undefined);
  const interval = firstPoint && momentumSelection(0, firstPoint, data.mode);
  const sortedTopics = [...data.topics].sort((left, right) => {
    const leftValue = row.values[left.topic_id];
    const rightValue = row.values[right.topic_id];
    if (leftValue == null) return rightValue == null ? left.topic_id - right.topic_id : 1;
    if (rightValue == null) return -1;
    return rightValue - leftValue || left.topic_id - right.topic_id;
  });

  return (
    <div className="momentum-tooltip">
      <strong>Week of {formatMomentumDate(row.week_start)}</strong>
      {interval ? (
        <p className="tooltip-interval">
          {formatMomentumDate(interval.dateFrom)} – {formatMomentumDate(interval.dateTo)} · UTC
        </p>
      ) : null}
      {firstPoint?.is_partial_week ? (
        <p className="tooltip-partial">Partial week · selected dates only</p>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Topic</th>
            <th>{data.mode === "count" ? "Papers" : "Index"}</th>
          </tr>
        </thead>
        <tbody>
          {sortedTopics.map((topic) => {
            const value = row.values[topic.topic_id];
            return (
              <tr key={topic.topic_id}>
                <td>
                  <span
                    className="topic-swatch"
                    style={{ background: topicColor(topic.topic_id) }}
                    aria-hidden="true"
                  />
                  {topic.topic_name}
                </td>
                <td>
                  {value == null
                    ? "Unavailable"
                    : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.mode === "index" && sortedTopics.some((topic) => row.values[topic.topic_id] == null) ? (
        <p className="tooltip-note">
          Unavailable indices have no valid baseline, not zero publications.
        </p>
      ) : null}
    </div>
  );
}

export function ResearchMomentum({
  heading,
  dates,
  topicIds,
  topicsReady,
  onSelectPoint,
}: {
  heading?: IntelligenceChartHeading;
  dates: ResolvedDates;
  topicIds: readonly number[];
  topicsReady: boolean;
  onSelectPoint?: (selection: MomentumSelection) => void;
}) {
  const [mode, setMode] = useState<MomentumMode>("count");
  const id = useId();
  const dateError =
    dates.error ??
    (dates.date_from && dates.date_to
      ? validateCustomDates(dates.date_from, dates.date_to)
      : "Choose a resolved UTC date range.");
  const query = useIntelligenceMomentum(
    {
      date_from: dates.date_from,
      date_to: dates.date_to,
      topic_ids: topicIds,
      mode,
      include_partial_weeks: true,
    },
    topicsReady && !dateError && !!dates.date_from && !!dates.date_to,
  );
  const data = query.data?.data;
  let content;
  if (dateError) {
    content = <IntelligenceEmpty title="Choose a valid date range" description={dateError} />;
  } else if (!topicsReady) {
    content = (
      <IntelligenceEmpty
        title="Topics unavailable"
        description="Momentum will load when research topic options are available."
      />
    );
  } else if (query.error) {
    content = (
      <IntelligenceError
        key={query.errorUpdatedAt}
        error={query.error}
        label="momentum"
        onRetry={() => void query.refetch()}
      />
    );
  } else if (query.isPending) {
    content = <IntelligenceLoading label="Loading research momentum…" />;
  } else if (data) {
    content = (
      <MomentumVisualization
        data={data}
        isFetching={query.isFetching}
        onSelectPoint={onSelectPoint}
      />
    );
  }
  return (
    <div className="momentum">
      <IntelligenceChartHeader heading={heading}>
        <fieldset className="momentum-modes">
          <legend className="visually-hidden">Research Momentum measure</legend>
          {(
            [
              ["count", "Paper Count"],
              ["index", "Momentum Index"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={id}
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
      </IntelligenceChartHeader>
      <p className="momentum-description">
        {mode === "count"
          ? "Weekly indexed papers assigned to each selected topic."
          : "Topic activity relative to its baseline. An index of 100 represents baseline activity where a valid baseline exists."}
      </p>
      {content}
      <details className="methodology-disclosure">
        <summary>How to read this chart</summary>
        <div className="disclosure-content">
          <p>
            Counts measure indexed publications assigned to each topic, not research impact. Topic
            memberships overlap.
          </p>
          <p>
            Weeks start Monday at 00:00 UTC and end at the following Monday, exclusive. Partial
            boundary weeks include only the selected dates; they are not rescaled and should not be
            compared directly with full weeks.
          </p>
          <p>
            The index uses each topic's first full week as its baseline. An index of 100 represents
            baseline activity. A zero or missing baseline leaves indices unavailable; gaps do not
            mean zero publications.
          </p>
          <p>
            Historical completeness remains unknown. Corpus and classification limitations are
            available in Coverage & methodology above.
          </p>
          {query.data?.meta.warnings.length ? (
            <ul className="intelligence-warnings" aria-label="Momentum warnings">
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

function MomentumObservationDot({
  cx,
  cy,
  payload,
  topicId,
  mode,
  onSelect,
  active = false,
}: {
  cx?: number;
  cy?: number;
  payload?: MomentumRow;
  topicId: number;
  mode: MomentumMode;
  onSelect: (selection: MomentumSelection) => void;
  active?: boolean;
}) {
  const point = payload?.points[topicId];
  if (!point || cx === undefined || cy === undefined || payload?.values[topicId] == null)
    return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={active ? 5 : 3}
      fill={topicColor(topicId)}
      stroke="var(--color-surface)"
      strokeWidth={1.5}
      className="composition-point momentum-observation-dot"
      aria-hidden="true"
      onClick={() => onSelect(momentumSelection(topicId, point, mode))}
    />
  );
}

function MomentumVisualization({
  data,
  isFetching,
  onSelectPoint,
}: {
  data: MomentumData;
  isFetching: boolean;
  onSelectPoint?: (selection: MomentumSelection) => void;
}) {
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const rows = momentumRows(data);
  const mode = data.mode;
  if (!data.topics.length)
    return (
      <IntelligenceEmpty
        title="No topics available"
        description="No configured topics were returned."
      />
    );
  if (!rows.length)
    return (
      <IntelligenceEmpty
        title="No weekly observations"
        description="No weekly observations are available for this interval."
      />
    );
  return (
    <>
      {isFetching ? <p role="status">Updating research momentum…</p> : null}
      {!data.topics.some((topic) => topic.points.some((point) => point.paper_count > 0)) ? (
        <p role="status">
          No matching indexed papers. Returned zero counts describe this indexed dataset only.
        </p>
      ) : null}
      {mode === "index" &&
      data.topics.some((topic) => topic.points.some((point) => point.index_value == null)) ? (
        <p role="status">
          Some indices are unavailable because a valid nonzero full-week baseline is absent. Gaps do
          not imply zero publications.
        </p>
      ) : null}
      <div
        className="momentum-chart"
        role="img"
        aria-label={`Weekly ${mode === "count" ? "paper counts" : "momentum indices"} by topic; values available in the table below`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 12, right: 12, bottom: 24, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="week_start"
              tickFormatter={formatMomentumDate}
              minTickGap={40}
              tick={{ fontSize: 11 }}
              label={{ value: "Week starting (UTC)", position: "insideBottom", offset: -16 }}
            />
            <YAxis
              width={54}
              allowDecimals={mode === "index"}
              label={{
                value: mode === "count" ? "Papers" : "Index",
                angle: -90,
                position: "insideLeft",
              }}
            />
            {mode === "index" ? (
              <ReferenceLine y={100} stroke="var(--color-text-muted)" strokeDasharray="4 4" />
            ) : null}
            <Tooltip
              filterNull={false}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ maxWidth: "min(22rem, 85vw)", zIndex: 10 }}
              content={({ active, label }) => {
                const row = rows.find((item) => item.week_start === label);
                return active && row ? <MomentumTooltip row={row} data={data} /> : null;
              }}
            />
            {data.topics.map((topic) => (
              <Line
                strokeOpacity={
                  highlightedId === null || highlightedId === topic.topic_id ? 1 : 0.18
                }
                key={topic.topic_id}
                dataKey={(row: MomentumRow) => row.values[topic.topic_id]}
                name={topic.topic_name}
                stroke={topicColor(topic.topic_id)}
                type="linear"
                strokeWidth={2}
                connectNulls={false}
                dot={
                  rows.length <= 16
                    ? onSelectPoint
                      ? (props) => (
                          <MomentumObservationDot
                            {...props}
                            topicId={topic.topic_id}
                            mode={mode}
                            onSelect={onSelectPoint}
                          />
                        )
                      : { r: 2.5 }
                    : false
                }
                activeDot={
                  onSelectPoint
                    ? (props) => (
                        <MomentumObservationDot
                          {...props}
                          topicId={topic.topic_id}
                          mode={mode}
                          onSelect={onSelectPoint}
                          active
                        />
                      )
                    : { r: 5, stroke: "var(--color-surface)", strokeWidth: 2 }
                }
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="momentum-legend" aria-label="Topic legend">
        {data.topics.map((topic) => (
          <li key={topic.topic_id}>
            <button
              type="button"
              aria-pressed={highlightedId === topic.topic_id}
              aria-label={`Emphasize ${topic.topic_name}`}
              onClick={() =>
                setHighlightedId(highlightedId === topic.topic_id ? null : topic.topic_id)
              }
            >
              <span aria-hidden="true" style={{ background: topicColor(topic.topic_id) }} />
              {topic.topic_name}
            </button>
          </li>
        ))}
      </ul>
      <details>
        <summary>Weekly values{onSelectPoint ? " and point selection" : ""}</summary>
        <div className="momentum-table">
          <table>
            <caption>Returned weekly observations (UTC)</caption>
            <thead>
              <tr>
                <th>Week start</th>
                <th>Topic</th>
                <th>{mode === "count" ? "Papers" : "Index"}</th>
                <th>Included dates (inclusive)</th>
                {onSelectPoint ? <th>Select point</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((row) =>
                data.topics.map((topic) => {
                  const point = row.points[topic.topic_id];
                  const selection = point && momentumSelection(topic.topic_id, point, mode);
                  return (
                    <tr key={`${row.week_start}-${topic.topic_id}`}>
                      <td>{row.week_start}</td>
                      <td>{topic.topic_name}</td>
                      <td>{row.values[topic.topic_id] ?? "Unavailable"}</td>
                      <td>
                        {selection
                          ? `${selection.dateFrom} – ${selection.dateTo}${point?.is_partial_week ? " (partial week)" : ""}`
                          : "Unavailable"}
                      </td>
                      {onSelectPoint ? (
                        <td>
                          <button
                            type="button"
                            disabled={!selection}
                            onClick={() => selection && onSelectPoint(selection)}
                          >
                            Select {topic.topic_name}, {row.week_start}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
