import { IntelligenceChartHeader } from "./IntelligenceChartHeader";
import type { IntelligenceChartHeading } from "./IntelligenceChartHeader";
import { useId, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError } from "../../api/client";
import { useIntelligenceMatrix } from "../../hooks/useIntelligence";
import type { MomentumMatrixData, MomentumMatrixTopic } from "../../types/intelligence";
import type { ResolvedDates } from "../../utils/intelligenceFilters";
import {
  formatMatrixChange,
  matrixPoints,
  matrixSelection,
  matrixStateLabels,
  matrixWindowDates,
} from "../../utils/matrixData";
import type { MatrixSelection, MatrixWindowKind } from "../../utils/matrixData";
import { topicColor } from "../../utils/topicColors";
import { IntelligenceEmpty, IntelligenceError, IntelligenceLoading } from "./IntelligenceState";

function WindowLabel({ data, kind }: { data: MomentumMatrixData; kind: MatrixWindowKind }) {
  const window = kind === "recent" ? data.recent_window : data.previous_window;
  if (!window) return <>Unavailable</>;
  const dates = matrixWindowDates(window);
  return (
    <>
      {dates.dateFrom} – {dates.dateTo}
    </>
  );
}

export function MatrixTopicDetails({ topic }: { topic: MomentumMatrixTopic }) {
  return (
    <div className="matrix-topic-details">
      <strong>{topic.topic_name}</strong>
      <dl>
        <div>
          <dt>Current papers</dt>
          <dd>{topic.recent_paper_count.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Previous papers</dt>
          <dd>{topic.previous_paper_count.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Change</dt>
          <dd>
            {formatMatrixChange(topic.growth_percent)} · {topic.absolute_change > 0 ? "+" : ""}
            {topic.absolute_change.toLocaleString()} papers
          </dd>
        </div>
      </dl>
      <p>
        {matrixStateLabels[topic.growth_state]}
        {topic.low_baseline ? " · Low baseline" : ""}
      </p>
      {topic.growth_percent === null ? (
        <p>No previous-window baseline; percentage change is unavailable.</p>
      ) : null}
      {topic.low_baseline ? (
        <p className="matrix-caution">
          Previous count is below 10. Percentage changes are sensitive to small counts.
        </p>
      ) : null}
    </div>
  );
}

function MatrixMarker({
  cx = 0,
  cy = 0,
  topic,
  active,
}: {
  cx?: number;
  cy?: number;
  topic: MomentumMatrixTopic;
  active: boolean;
}) {
  const radius = active ? 9 : 6;
  const common = {
    "data-topic-id": topic.topic_id,
    "data-growth-state": topic.growth_state,
    fill: topic.low_baseline ? "var(--color-surface)" : topicColor(topic.topic_id),
    stroke: topicColor(topic.topic_id),
    strokeWidth: active ? 3 : 2,
    strokeDasharray: topic.low_baseline ? "3 2" : undefined,
  };
  if (topic.growth_state === "growing")
    return (
      <path
        d={`M ${cx} ${cy - radius} L ${cx + radius} ${cy + radius} L ${cx - radius} ${cy + radius} Z`}
        {...common}
      />
    );
  if (topic.growth_state === "declining")
    return (
      <path
        d={`M ${cx} ${cy - radius} L ${cx + radius} ${cy} L ${cx} ${cy + radius} L ${cx - radius} ${cy} Z`}
        {...common}
      />
    );
  return <circle cx={cx} cy={cy} r={radius} {...common} />;
}

function MatrixVisualization({
  data,
  onSelectWindow,
}: {
  data: MomentumMatrixData;
  onSelectWindow?: (selection: MatrixSelection) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<MatrixWindowKind>("recent");
  const points = matrixPoints(data.topics);
  const activeTopic = data.topics.find((topic) => topic.topic_id === activeId);
  const unavailable = data.topics.filter((topic) => topic.growth_percent === null);
  function selectWindow(kind: MatrixWindowKind) {
    setSelectedWindow(kind);
    if (activeTopic) {
      const selection = matrixSelection(data, activeTopic.topic_id, kind);
      if (selection) onSelectWindow?.(selection);
    }
  }

  return (
    <>
      <div className="matrix-windows" aria-label="Comparison windows">
        <p>
          <strong>Current</strong> <WindowLabel data={data} kind="recent" />
        </p>
        <p>
          <strong>Previous</strong> <WindowLabel data={data} kind="previous" />
        </p>
        <span>Inclusive UTC dates · {data.window_weeks} complete weeks each</span>
      </div>
      {data.topics.some((topic) => topic.low_baseline) ? (
        <p className="matrix-caution" role="status">
          Hollow dashed markers indicate low baselines. Treat their percentage changes cautiously.
        </p>
      ) : null}
      {points.length ? (
        <div
          className="matrix-chart"
          aria-label="Current indexed papers versus percentage change; use topic buttons below for details"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 18, right: 24, bottom: 28, left: 14 }} accessibilityLayer>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="activity"
                padding={{ left: 10, right: 10 }}
                name="Current papers"
                allowDecimals={false}
                domain={[0, "auto"]}
                label={{
                  value: "Current-window indexed papers",
                  position: "insideBottom",
                  offset: -18,
                }}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="change"
                padding={{ top: 12, bottom: 12 }}
                name="Change"
                unit="%"
                domain={[(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]}
                width={72}
                label={{ value: "Change (%)", angle: -90, position: "insideLeft" }}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => Number(value.toFixed(0)).toLocaleString("en-US")}
              />
              <ReferenceLine y={0} stroke="var(--color-text-muted)" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                wrapperStyle={{ maxWidth: "min(22rem, 85vw)", zIndex: 10 }}
                content={({ active, payload }) => {
                  const topic = payload?.[0]?.payload as MomentumMatrixTopic | undefined;
                  return active && topic ? (
                    <div className="momentum-tooltip">
                      <MatrixTopicDetails topic={topic} />
                    </div>
                  ) : null;
                }}
              />
              {points.map((topic) => (
                <Scatter
                  key={topic.topic_id}
                  name={topic.topic_name}
                  data={[topic]}
                  fill={topicColor(topic.topic_id)}
                  isAnimationActive={false}
                  onMouseEnter={() => setActiveId(topic.topic_id)}
                  onClick={() => setActiveId(topic.topic_id)}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <MatrixMarker {...props} topic={topic} active={activeId === topic.topic_id} />
                  )}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <IntelligenceEmpty
          title="Percentage comparison unavailable"
          description="No selected topic has a previous-window baseline. Raw counts remain available below."
        />
      )}
      <p className="matrix-legend">
        ▲ Growing · ◆ Declining · ● Unchanged (0%) · Hollow/dashed: low baseline
      </p>
      <div className="matrix-topics" aria-label="Highlight a research topic">
        {data.topics.map((topic) => (
          <button
            key={topic.topic_id}
            type="button"
            className="matrix-topic-button"
            aria-pressed={activeId === topic.topic_id}
            aria-label={`${topic.topic_name} ${formatMatrixChange(topic.growth_percent)} ${matrixStateLabels[topic.growth_state]}${topic.low_baseline ? " · Low baseline" : ""}`}
            onClick={() => setActiveId(topic.topic_id)}
            onFocus={() => setActiveId(topic.topic_id)}
          >
            <span
              className="topic-swatch"
              style={{ background: topicColor(topic.topic_id) }}
              aria-hidden="true"
            />
            {topic.topic_name} <span>{formatMatrixChange(topic.growth_percent)}</span>
            <small>
              {matrixStateLabels[topic.growth_state]}
              {topic.low_baseline ? " · Low baseline" : ""}
            </small>
          </button>
        ))}
      </div>
      {unavailable.length ? (
        <div className="matrix-unavailable">
          <strong>Unavailable change</strong>
          <ul>
            {unavailable.map((topic) => (
              <li key={topic.topic_id}>
                {topic.topic_name}: {topic.recent_paper_count.toLocaleString()} current /{" "}
                {topic.previous_paper_count.toLocaleString()} previous papers · no baseline
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {activeTopic ? (
        <div className="matrix-selection">
          <MatrixTopicDetails topic={activeTopic} />
          <div className="matrix-window-actions" aria-label="Inspect a topic window">
            <button
              className="button button-secondary"
              type="button"
              aria-pressed={selectedWindow === "recent"}
              onClick={() => selectWindow("recent")}
            >
              Inspect current window
            </button>
            <button
              className="button button-secondary"
              type="button"
              aria-pressed={selectedWindow === "previous"}
              onClick={() => selectWindow("previous")}
            >
              Inspect previous window
            </button>
          </div>
          <p>
            {activeTopic.topic_name} · <WindowLabel data={data} kind={selectedWindow} /> (inclusive
            UTC) ·{" "}
            {(selectedWindow === "recent"
              ? activeTopic.recent_paper_count
              : activeTopic.previous_paper_count
            ).toLocaleString()}{" "}
            indexed papers
          </p>
        </div>
      ) : (
        <p className="matrix-hint">
          Select or focus a topic to highlight it and inspect its comparison windows.
        </p>
      )}
    </>
  );
}

export function MomentumMatrix({
  heading,
  dates,
  topicIds,
  topicsReady,
  onSelectWindow,
}: {
  heading?: IntelligenceChartHeading;
  dates: ResolvedDates;
  topicIds: readonly number[];
  topicsReady: boolean;
  onSelectWindow?: (selection: MatrixSelection) => void;
}) {
  const [windowWeeks, setWindowWeeks] = useState(4);
  const selectorId = useId();
  const ready = topicsReady && !dates.error && !!dates.date_from && !!dates.date_to;
  const query = useIntelligenceMatrix(
    {
      date_from: dates.date_from,
      date_to: dates.date_to,
      topic_ids: topicIds,
      window_weeks: windowWeeks,
    },
    ready,
  );
  const data = query.data?.data;
  const shortRange =
    query.error instanceof ApiError &&
    query.error.status === 422 &&
    /both complete comparison windows/.test(query.error.message);
  let content;
  if (dates.error || !dates.date_from || !dates.date_to) {
    content = (
      <IntelligenceEmpty
        title="Choose a valid comparison range"
        description={dates.error ?? "Choose a resolved UTC date range."}
      />
    );
  } else if (!topicsReady) {
    content = (
      <IntelligenceEmpty
        title="Topics unavailable"
        description="The matrix will load when research topics are available."
      />
    );
  } else if (shortRange) {
    content = (
      <IntelligenceEmpty
        title="More complete weeks needed"
        description={`This range cannot contain two ${windowWeeks}-week windows. Choose an earlier start date or fewer comparison weeks. Partial weeks and the current incomplete UTC week cannot be compared.`}
      />
    );
  } else if (query.error) {
    content = (
      <IntelligenceError
        key={query.errorUpdatedAt}
        error={query.error}
        label="momentum matrix"
        onRetry={() => void query.refetch()}
      />
    );
  } else if (query.isPending) {
    content = <IntelligenceLoading label="Loading momentum matrix…" />;
  } else if (!data?.recent_window || !data.previous_window) {
    content = (
      <IntelligenceEmpty
        title="Comparison windows unavailable"
        description="There is not enough dated indexed history to resolve comparable windows."
      />
    );
  } else if (!data.topics.length) {
    content = (
      <IntelligenceEmpty
        title="No topics available"
        description="No research topics were returned for this selection."
      />
    );
  } else {
    content = (
      <MatrixVisualization
        key={`${dates.date_from}/${dates.date_to}/${topicIds.join(",")}/${windowWeeks}`}
        data={data}
        onSelectWindow={onSelectWindow}
      />
    );
  }

  return (
    <div className="momentum-matrix">
      <IntelligenceChartHeader heading={heading}>
        <div className="matrix-toolbar">
          <label htmlFor={selectorId}>
            Weeks per window
            <select
              id={selectorId}
              className="form-control"
              value={windowWeeks}
              onChange={(event) => setWindowWeeks(Number(event.target.value))}
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
      {query.isFetching && !query.isPending ? <p role="status">Updating momentum matrix…</p> : null}
      {content}
      <details className="methodology-disclosure">
        <summary>How to read the matrix</summary>
        <div className="disclosure-content">
          <p>
            Activity counts indexed publications, not research impact. Topic memberships can
            overlap; historical completeness is unknown.
          </p>
          <p>
            Both adjacent windows contain the same number of complete Monday-based UTC weeks. The
            current incomplete week and partial boundary weeks are excluded. Both windows must fit
            inside your selected range; history is never expanded automatically.
          </p>
          <p>
            The zero line separates growing and declining counts. Unchanged means exactly zero
            change; no statistical stability threshold is applied. Percentage change is unavailable
            when the previous count is zero, including zero in both windows.
          </p>
          <p>
            A previous count below 10 is flagged as a low baseline. This is a product heuristic, not
            a statistical significance test. Equal calendar windows do not guarantee equal source
            coverage.
          </p>
          {query.data?.meta.warnings.length ? (
            <ul className="intelligence-warnings" aria-label="Matrix warnings">
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
