import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIntelligenceComposition } from "../../hooks/useIntelligence";
import type { CompositionData, CompositionTopic } from "../../types/intelligence";
import { validateCustomDates } from "../../utils/intelligenceFilters";
import type { ResolvedDates } from "../../utils/intelligenceFilters";
import {
  compositionDates,
  compositionRows,
  compositionSelection,
  formatPrevalence,
} from "../../utils/compositionData";
import type { CompositionRow, CompositionSelection } from "../../utils/compositionData";
import { formatMomentumDate } from "../../utils/momentumData";
import { topicColor } from "../../utils/topicColors";
import { IntelligenceEmpty, IntelligenceError, IntelligenceLoading } from "./IntelligenceState";

type InspectObservation = (topicId: number, row: CompositionRow) => void;
interface InspectedObservation {
  topicId: number;
  weekStart: string;
}

export function CompositionTooltip({
  row,
  topics,
}: {
  row: CompositionRow;
  topics: CompositionTopic[];
}) {
  const dates = compositionDates(row.week);
  return (
    <div className="momentum-tooltip composition-tooltip">
      <strong>Week of {formatMomentumDate(row.week_start)}</strong>
      <p className="tooltip-interval">
        {formatMomentumDate(dates.dateFrom)} – {formatMomentumDate(dates.dateTo)} · UTC
      </p>
      <p>Corpus denominator: {row.week.total_papers.toLocaleString()} indexed papers</p>
      {row.week.is_partial_week ? (
        <p className="tooltip-partial">Partial week · selected dates only</p>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Topic</th>
            <th>Prevalence</th>
            <th>Papers</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.topic_id}>
              <td>
                <span
                  className="topic-swatch"
                  aria-hidden="true"
                  style={{ background: topicColor(topic.topic_id) }}
                />
                {topic.topic_name}
              </td>
              <td>{formatPrevalence(row.values[topic.topic_id])}</td>
              <td>
                {row.observations[topic.topic_id]?.topic_papers.toLocaleString() ?? "Unavailable"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {row.week.total_papers === 0 ? (
        <p className="tooltip-note">
          No indexed corpus papers in this interval; prevalence is unavailable.
        </p>
      ) : null}
    </div>
  );
}

function CompositionPoint({
  cx,
  cy,
  payload,
  topic,
  onInspect,
  active = false,
}: {
  cx?: number;
  cy?: number;
  payload?: CompositionRow;
  topic: CompositionTopic;
  onInspect: InspectObservation;
  active?: boolean;
}) {
  if (cx === undefined || cy === undefined || !payload || payload.values[topic.topic_id] == null)
    return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={active ? 5 : 3}
      fill={topicColor(topic.topic_id)}
      stroke="var(--color-surface)"
      strokeWidth={active ? 2 : 1}
      className="composition-point"
      aria-hidden="true"
      onClick={() => onInspect(topic.topic_id, payload)}
    />
  );
}

function CompositionChart({
  rows,
  topics,
  onInspect,
}: {
  rows: CompositionRow[];
  topics: CompositionTopic[];
  onInspect: InspectObservation;
}) {
  return (
    <div
      className="momentum-chart"
      role="group"
      aria-label="Independent weekly topic prevalence lines; keyboard inspection is available in Weekly composition values"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 12, right: 12, bottom: 24, left: 8 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="week_start"
            tickFormatter={formatMomentumDate}
            minTickGap={40}
            tick={{ fontSize: 12 }}
            label={{ value: "Week starting (UTC)", position: "insideBottom", offset: -16 }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(value: number) => `${value}%`}
            width={60}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            filterNull={false}
            allowEscapeViewBox={{ x: false, y: false }}
            wrapperStyle={{ maxWidth: "min(24rem, 85vw)", zIndex: 10 }}
            content={({ active, label }) => {
              const row = rows.find((item) => item.week_start === label);
              return active && row ? <CompositionTooltip row={row} topics={topics} /> : null;
            }}
          />
          {topics.map((topic) => (
            <Line
              key={topic.topic_id}
              name={topic.topic_name}
              dataKey={(row: CompositionRow) => row.values[topic.topic_id]}
              stroke={topicColor(topic.topic_id)}
              strokeWidth={2}
              type="linear"
              connectNulls={false}
              isAnimationActive={false}
              dot={
                rows.length <= 16
                  ? (props) => <CompositionPoint {...props} topic={topic} onInspect={onInspect} />
                  : false
              }
              activeDot={(props) => (
                <CompositionPoint {...props} topic={topic} onInspect={onInspect} active />
              )}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompositionValueRow({
  row,
  topic,
  selected,
  onInspect,
}: {
  row: CompositionRow;
  topic: CompositionTopic;
  selected: boolean;
  onInspect: InspectObservation;
}) {
  const dates = compositionDates(row.week);
  const observation = row.observations[topic.topic_id];
  return (
    <tr>
      <td>{row.week_start}</td>
      <td>{topic.topic_name}</td>
      <td>{formatPrevalence(row.values[topic.topic_id])}</td>
      <td>{observation?.topic_papers.toLocaleString() ?? "Unavailable"}</td>
      <td>{row.week.total_papers.toLocaleString()}</td>
      <td>
        {dates.dateFrom} – {dates.dateTo}
        {row.week.is_partial_week ? " (partial week)" : ""}
      </td>
      <td>
        <button
          className="button button-secondary"
          type="button"
          disabled={!observation}
          aria-pressed={selected}
          onClick={() => onInspect(topic.topic_id, row)}
        >
          Inspect {topic.topic_name}, {row.week_start}
        </button>
      </td>
    </tr>
  );
}

function CompositionVisualization({
  data,
  includePartialWeeks,
  onSelectPoint,
}: {
  data: CompositionData;
  includePartialWeeks: boolean;
  onSelectPoint?: (selection: CompositionSelection) => void;
}) {
  const rows = useMemo(() => compositionRows(data), [data]);
  const [inspected, setInspected] = useState<InspectedObservation | null>(null);
  const inspectedRow = rows.find((row) => row.week_start === inspected?.weekStart);
  const inspectedTopic = data.topics.find((topic) => topic.topic_id === inspected?.topicId);
  function inspect(topicId: number, row: CompositionRow) {
    const selection = compositionSelection(topicId, row.week, includePartialWeeks);
    if (!selection) return;
    setInspected({ topicId, weekStart: row.week_start });
    onSelectPoint?.(selection);
  }

  return (
    <>
      <p className="intelligence-filter-note">
        Reporting interval: {data.interval.date_from ?? "unavailable"} through{" "}
        {data.interval.date_to ?? "unavailable"} (inclusive UTC).
      </p>
      {!rows.some((row) => row.week.total_papers > 0) ? (
        <p role="status">
          No indexed corpus papers in these weeks. Prevalence is unavailable; counts remain
          available below.
        </p>
      ) : null}
      <CompositionChart rows={rows} topics={data.topics} onInspect={inspect} />
      <ul className="momentum-legend" aria-label="Composition topic legend">
        {data.topics.map((topic) => (
          <li key={topic.topic_id}>
            <span aria-hidden="true" style={{ background: topicColor(topic.topic_id) }} />
            {topic.topic_name}
          </li>
        ))}
      </ul>
      {inspectedRow && inspectedTopic ? (
        <div className="composition-inspection" role="status" aria-live="polite">
          <CompositionTooltip row={inspectedRow} topics={[inspectedTopic]} />
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setInspected(null)}
          >
            Clear composition selection
          </button>
        </div>
      ) : null}
      <details>
        <summary>Weekly composition values and point selection</summary>
        <div className="momentum-table">
          <table>
            <caption>Weekly topic prevalence · returned UTC observations</caption>
            <thead>
              <tr>
                <th>Week start</th>
                <th>Topic</th>
                <th>Prevalence</th>
                <th>Topic papers</th>
                <th>Corpus papers</th>
                <th>Included dates (inclusive UTC)</th>
                <th>Inspect observation</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((row) =>
                data.topics.map((topic) => (
                  <CompositionValueRow
                    key={`${row.week_start}:${topic.topic_id}`}
                    row={row}
                    topic={topic}
                    selected={
                      inspected?.topicId === topic.topic_id &&
                      inspected.weekStart === row.week_start
                    }
                    onInspect={inspect}
                  />
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function ResearchComposition({
  dates,
  topicIds,
  topicsReady,
  onSelectPoint,
}: {
  dates: ResolvedDates;
  topicIds: readonly number[];
  topicsReady: boolean;
  onSelectPoint?: (selection: CompositionSelection) => void;
}) {
  const [includePartialWeeks, setIncludePartialWeeks] = useState(true);
  const dateError =
    dates.error ??
    (dates.date_from && dates.date_to
      ? validateCustomDates(dates.date_from, dates.date_to)
      : "Choose a resolved UTC date range.");
  const query = useIntelligenceComposition(
    {
      date_from: dates.date_from,
      date_to: dates.date_to,
      topic_ids: topicIds,
      include_partial_weeks: includePartialWeeks,
    },
    topicsReady && !dateError && !!dates.date_from && !!dates.date_to,
  );
  const data = query.data?.data;
  let content;
  if (dateError) {
    content = (
      <IntelligenceEmpty title="Choose a valid composition range" description={dateError} />
    );
  } else if (!topicsReady) {
    content = (
      <IntelligenceEmpty
        title="Topics unavailable"
        description="Composition will load when research topics are available."
      />
    );
  } else if (query.error) {
    content = (
      <IntelligenceError
        key={query.errorUpdatedAt}
        error={query.error}
        label="composition"
        onRetry={() => void query.refetch()}
      />
    );
  } else if (query.isPending) {
    content = <IntelligenceLoading label="Loading research composition…" />;
  } else if (!data?.topics.length) {
    content = (
      <IntelligenceEmpty
        title="No topics available"
        description="No research topics were returned for this selection."
      />
    );
  } else if (!data.weeks.length) {
    content = (
      <IntelligenceEmpty
        title="No weekly composition observations"
        description={
          includePartialWeeks
            ? "No weekly indexed observations are available for this interval."
            : "No complete weeks were returned. Include partial boundary weeks or choose a longer range."
        }
      />
    );
  } else {
    content = (
      <CompositionVisualization
        key={`${dates.date_from}/${dates.date_to}/${topicIds.join(",")}/${includePartialWeeks}`}
        data={data}
        includePartialWeeks={includePartialWeeks}
        onSelectPoint={onSelectPoint}
      />
    );
  }

  return (
    <div className="research-composition">
      <div className="composition-toolbar">
        <p>
          Each line shows a topic's share of all indexed papers that week. Topics overlap; their
          percentages may total more than 100%.
        </p>
        <label>
          <input
            type="checkbox"
            checked={includePartialWeeks}
            onChange={(event) => setIncludePartialWeeks(event.target.checked)}
          />
          Include partial boundary weeks
        </label>
      </div>
      {query.isFetching && !query.isPending ? (
        <p role="status">Updating research composition…</p>
      ) : null}
      {content}
      <details className="methodology-disclosure">
        <summary>How to read research composition</summary>
        <div className="disclosure-content">
          <p>
            Each percentage is returned directly for its topic and week. Topics overlap: lines are
            independent and are never stacked or normalized.
          </p>
          <p>
            The denominator is all distinct dated indexed papers in the included interval, including
            untagged papers and papers outside the selected topics. Selecting fewer topics does not
            change it.
          </p>
          <p>
            A Monday-based UTC week ends at the following Monday, exclusive. Partial weeks clip both
            topic counts and corpus counts to the selected dates and are not rescaled. Excluding
            partial weeks removes those observations through the API.
          </p>
          <p>
            A zero percentage means no topic matches in a week with indexed papers. Null or missing
            percentages stay unavailable and break the line. A zero corpus denominator leaves
            prevalence unavailable.
          </p>
          <p>
            Historical completeness remains unknown, including for full calendar weeks. Automatic
            topic assignments can overlap or contain classification noise. Indexed prevalence does
            not measure global research coverage or impact.
          </p>
          {query.data?.meta.warnings.length ? (
            <ul className="intelligence-warnings" aria-label="Composition warnings">
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
