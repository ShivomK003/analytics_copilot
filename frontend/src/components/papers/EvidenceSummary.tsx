import type { TopicOption } from "../../types/intelligence";
import type { EvidenceContext, EvidenceMetric } from "../../utils/evidenceContext";

const sourceLabels = {
  momentum: "Research Momentum",
  matrix: "Momentum Matrix",
  prevalence: "Topic Prevalence Change",
  composition: "Weekly topic prevalence",
  relationships: "Research Relationships",
  heatmap: "Topic–Category Heatmap",
};
const metricLabels: Record<EvidenceMetric, string> = {
  count: "Paper count",
  index: "Momentum Index",
  prevalence_pct: "Topic prevalence",
  paper_count: "Shared paper count",
  category_prevalence_pct: "Category prevalence",
  topic_distribution_pct: "Topic distribution",
};

export function EvidenceSummary({
  context,
  topics,
  compact = false,
}: {
  compact?: boolean;
  context: EvidenceContext;
  topics?: TopicOption[];
}) {
  const labels = context.topicIds.map(
    (id) => topics?.find((topic) => topic.topic_id === id)?.topic_name ?? `Topic ${id}`,
  );
  const explanation =
    context.source === "prevalence"
      ? "These topic publications contribute to the selected window. Individual papers do not prove a change in prevalence; the comparison also depends on the all-corpus denominator."
      : context.topicIds.length === 2
        ? "Publications assigned to both topics in the selected interval. Co-occurrence does not imply citations, causality or semantic similarity."
        : "Indexed publications associated with this topic and the selected publication interval.";
  if (compact)
    return (
      <div className="evidence-summary evidence-summary-compact">
        <p className="page-eyebrow">
          Opened from Research Intelligence · {sourceLabels[context.source]}
        </p>
        <h2>
          {labels.join(" ∩ ")}
          {context.category ? ` · ${context.category}` : ""}
        </h2>
        <ul className="evidence-context-chips" aria-label="Preserved analytical constraints">
          <li>
            {context.dateFrom ?? "Unbounded start"} – {context.dateTo ?? "Unbounded end"} ·
            inclusive UTC
          </li>
          {context.window ? (
            <li>
              {context.window === "recent" ? "Current" : "Previous"} window · {context.windowWeeks}{" "}
              complete weeks
            </li>
          ) : null}
          {context.category ? (
            <li>
              {context.categoryScope === "primary"
                ? "Primary category only"
                : "All category assignments"}
            </li>
          ) : null}
          {context.partialWeek ? <li>Partial week · included dates only</li> : null}
          {context.metric ? <li>{metricLabels[context.metric]}</li> : null}
        </ul>
        <details>
          <summary>About this selection</summary>
          <p>
            {explanation} Search refines this same indexed cohort; historical completeness remains
            unknown.
          </p>
        </details>
      </div>
    );
  return (
    <div className="evidence-summary">
      <p className="page-eyebrow">{sourceLabels[context.source]}</p>
      {context.metric ? <p>Selected measure: {metricLabels[context.metric]}</p> : null}
      <h3>
        {labels.join(" ∩ ")}
        {context.category ? ` · ${context.category}` : ""}
      </h3>
      <p>
        {context.dateFrom ?? "Unbounded start"} – {context.dateTo ?? "Unbounded end"} · inclusive
        UTC publication dates
      </p>
      {context.window ? (
        <p>
          <strong>{context.window === "recent" ? "Current" : "Previous"} comparison window</strong>{" "}
          · {context.windowWeeks} complete weeks
        </p>
      ) : null}
      {context.partialWeek ? <p>Partial week · effective included dates only</p> : null}
      {context.category ? (
        <p>
          Category scope:{" "}
          {context.categoryScope === "primary"
            ? "Primary category only"
            : "All category assignments, including secondary"}
        </p>
      ) : null}
      <p>{explanation}</p>
    </div>
  );
}
