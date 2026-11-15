import { IntelligenceChartHeader } from "./IntelligenceChartHeader";
import type { IntelligenceChartHeading } from "./IntelligenceChartHeader";
import { useMemo, useState } from "react";
import { HeatmapCategoryPicker, TopicCategoryGrid } from "../heatmap/TopicCategoryGrid";
import type { HeatmapCoordinate, HeatmapValue } from "../heatmap/TopicCategoryGrid";
import { useIntelligenceHeatmap } from "../../hooks/useIntelligence";
import type { CategoryScope, TopicCategoryHeatmapData } from "../../types/intelligence";
import type { ResolvedDates } from "../../utils/intelligenceFilters";
import {
  formatHeatmapValue,
  heatmapCells,
  heatmapMetrics,
  heatmapMetricValue,
  heatmapSelection,
} from "../../utils/heatmapData";
import type { HeatmapMetric, HeatmapSelection } from "../../utils/heatmapData";
import { IntelligenceEmpty, IntelligenceError, IntelligenceLoading } from "./IntelligenceState";

function HeatmapVisualization({
  data,
  metric,
  onSelectCell,
}: {
  data: TopicCategoryHeatmapData;
  metric: HeatmapMetric;
  onSelectCell?: (selection: HeatmapSelection) => void;
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[] | null>(null);
  const cells = useMemo(() => heatmapCells(data), [data]);
  const categories = data.categories.map((category) => ({
    key: String(category.category_id),
    label: category.category_code,
  }));
  const topics = data.topics.map((topic) => ({
    key: String(topic.topic_id),
    label: topic.topic_name,
  }));
  const selectedKeys = (
    selectedCategories ?? categories.slice(0, 10).map((category) => category.key)
  ).filter((key) => categories.some((category) => category.key === key));
  const visibleCategories = selectedKeys.flatMap((key) =>
    categories.filter((category) => category.key === key),
  );
  const maximum =
    metric === "paper_count" ? Math.max(0, ...data.cells.map((cell) => cell.paper_count)) : 100;

  function getCell(coordinate: HeatmapCoordinate): HeatmapValue {
    const cell = cells.get(`${coordinate.categoryKey}:${coordinate.topicKey}`);
    if (!cell)
      return {
        value: undefined,
        label: "—",
        description: "Observation unavailable; no count or percentage was returned.",
      };
    const value = heatmapMetricValue(cell, metric);
    const category = data.categories.find(
      (item) => String(item.category_id) === coordinate.categoryKey,
    )!;
    const topic = data.topics.find((item) => String(item.topic_id) === coordinate.topicKey)!;
    let context = "Distinct indexed papers assigned to both this topic and category.";
    if (metric === "category_prevalence_pct")
      context = `Denominator: ${category.paper_count.toLocaleString()} indexed category papers, including untagged papers and papers outside the selected topics.`;
    if (metric === "topic_distribution_pct")
      context = `Denominator: ${topic.paper_count.toLocaleString()} dated indexed papers for this topic, independent of category scope and visible categories.`;
    const unavailable =
      value === null
        ? " A zero denominator makes this percentage unavailable; this is not a zero value."
        : "";
    return {
      value,
      label: value == null ? "—" : formatHeatmapValue(value, metric),
      description: `${heatmapMetrics[metric]}: ${formatHeatmapValue(value, metric)}. Shared papers: ${cell.paper_count.toLocaleString()}. ${context}${unavailable} Category scope: ${data.category_scope}.`,
    };
  }
  function select(coordinate: HeatmapCoordinate) {
    if (!cells.has(`${coordinate.categoryKey}:${coordinate.topicKey}`)) return;
    const selection = heatmapSelection(data, coordinate, metric);
    if (selection) onSelectCell?.(selection);
  }

  return (
    <div className="heatmap-visualization">
      <details className="heatmap-category-disclosure">
        <summary>
          Choose categories · {selectedKeys.length} shown of {categories.length}
        </summary>
        <p className="chart-caption">
          Initially showing up to 10 categories in the returned ranking. Changes reset the grid
          scroll position.
        </p>
        <HeatmapCategoryPicker
          categories={categories}
          selected={selectedKeys}
          onChange={setSelectedCategories}
          onReset={() => setSelectedCategories(null)}
        />
      </details>
      <TopicCategoryGrid
        scrollKey={JSON.stringify(selectedKeys)}
        categories={visibleCategories}
        topics={topics}
        maximum={maximum}
        metricLabel={heatmapMetrics[metric]}
        getCell={getCell}
        onSelect={select}
      />
    </div>
  );
}

export function TopicCategoryHeatmap({
  heading,
  dates,
  topicIds,
  topicsReady,
  onSelectCell,
}: {
  heading?: IntelligenceChartHeading;
  dates: ResolvedDates;
  topicIds: readonly number[];
  topicsReady: boolean;
  onSelectCell?: (selection: HeatmapSelection) => void;
}) {
  const [scope, setScope] = useState<CategoryScope>("all");
  const [metric, setMetric] = useState<HeatmapMetric>("paper_count");
  const ready = topicsReady && !dates.error && !!dates.date_from && !!dates.date_to;
  const query = useIntelligenceHeatmap(
    {
      date_from: dates.date_from,
      date_to: dates.date_to,
      topic_ids: topicIds,
      category_scope: scope,
    },
    ready,
  );
  const data = query.data?.data;
  let content;
  if (dates.error || !dates.date_from || !dates.date_to) {
    content = (
      <IntelligenceEmpty
        title="Choose a valid heatmap range"
        description={dates.error ?? "Choose a resolved UTC date range."}
      />
    );
  } else if (!topicsReady) {
    content = (
      <IntelligenceEmpty
        title="Topics unavailable"
        description="The heatmap will load when research topics are available."
      />
    );
  } else if (query.error) {
    content = (
      <IntelligenceError
        key={query.errorUpdatedAt}
        error={query.error}
        label="heatmap"
        onRetry={() => void query.refetch()}
      />
    );
  } else if (query.isPending) {
    content = <IntelligenceLoading label="Loading topic–category heatmap…" />;
  } else if (!data?.topics.length) {
    content = (
      <IntelligenceEmpty
        title="No topics available"
        description="No research topics were returned for this selection."
      />
    );
  } else if (!data.categories.length) {
    content = (
      <IntelligenceEmpty
        title="No active categories"
        description="No dated category activity was indexed for this interval and scope. Try another date range or category scope."
      />
    );
  } else {
    content = (
      <HeatmapVisualization
        key={`${dates.date_from}/${dates.date_to}/${topicIds.join(",")}/${scope}`}
        data={data}
        metric={metric}
        onSelectCell={onSelectCell}
      />
    );
  }

  return (
    <div className="intelligence-heatmap">
      <IntelligenceChartHeader heading={heading}>
        <div className="heatmap-controls">
          <label>
            Heatmap metric
            <select
              className="form-control"
              value={metric}
              onChange={(event) => setMetric(event.target.value as HeatmapMetric)}
            >
              {Object.entries(heatmapMetrics).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Heatmap category scope
            <select
              className="form-control"
              value={scope}
              onChange={(event) => setScope(event.target.value as CategoryScope)}
            >
              <option value="all">All category assignments</option>
              <option value="primary">Primary category only</option>
            </select>
          </label>
        </div>
      </IntelligenceChartHeader>
      {query.isFetching && !query.isPending ? (
        <p role="status">Updating topic–category heatmap…</p>
      ) : null}
      {content}
      <details className="methodology-disclosure">
        <summary>How to read this heatmap</summary>
        <div className="disclosure-content">
          <p>
            Counts describe distinct indexed papers assigned to both topic and category. Category
            prevalence uses all category papers as its denominator; topic distribution uses all
            dated papers for that topic. Percentages come directly from the returned dataset and
            never from the displayed grid.
          </p>
          <p>
            All assignments include primary and secondary category memberships. Primary scope uses
            the paper's primary category; missing primary mappings do not contribute cells but
            remain in topic totals. Topic and category memberships overlap, so totals may exceed
            100%.
          </p>
          <p>
            Category selection changes only the visible rows, not denominators. Zero is an observed
            value; a dash marks an unavailable percentage or observation. Count colors scale to the
            full returned grid maximum; percentage colors use a fixed 0–100% scale.
          </p>
          <p>
            Historical completeness is unknown. Automatic topic assignments can be noisy. Indexed
            activity does not measure research impact.
          </p>
          {query.data?.meta.warnings.length ? (
            <ul className="intelligence-warnings" aria-label="Heatmap warnings">
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
