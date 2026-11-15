import type { ComparisonWindow, CompositionData, MomentumMatrixData } from "../types/intelligence";
import { matrixSelection } from "./matrixData";
import type { MatrixSelection, MatrixWindowKind } from "./matrixData";

export interface PeriodPrevalence {
  topicPapers: number | null;
  totalPapers: number | null;
  prevalence: number | null;
}
export interface PrevalenceChangeRow {
  topicId: number;
  topicName: string;
  previous: PeriodPrevalence;
  current: PeriodPrevalence;
  change: number | null;
}
export interface PrevalenceSelection extends MatrixSelection {
  kind: "prevalence-change";
  metric: "prevalence_pct";
}
const weekMs = 7 * 86400000;
const unavailable: PeriodPrevalence = { topicPapers: null, totalPapers: null, prevalence: null };

function periodPrevalence(
  data: CompositionData,
  topicId: number,
  window: ComparisonWindow,
): PeriodPrevalence {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end_exclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || (end - start) % weekMs)
    return unavailable;
  let totalPapers = 0;
  let topicPapers = 0;
  // Disjoint publication weeks make summed distinct counts valid period counts.
  for (let time = start; time < end; time += weekMs) {
    const key = new Date(time).toISOString().slice(0, 10);
    const matches = data.weeks.filter((week) => week.week_start === key);
    if (matches.length !== 1) return unavailable;
    const week = matches[0];
    const observations = week.topics.filter((topic) => topic.topic_id === topicId);
    const observation = observations[0];
    if (
      week.is_partial_week ||
      Date.parse(week.effective_start) !== time ||
      Date.parse(week.effective_end_exclusive) !== time + weekMs ||
      observations.length !== 1 ||
      !Number.isSafeInteger(week.total_papers) ||
      week.total_papers < 0 ||
      !observation ||
      !Number.isSafeInteger(observation.topic_papers) ||
      observation.topic_papers < 0 ||
      observation.topic_papers > week.total_papers
    )
      return unavailable;
    totalPapers += week.total_papers;
    topicPapers += observation.topic_papers;
  }
  return {
    topicPapers,
    totalPapers,
    prevalence: totalPapers > 0 ? (100 * topicPapers) / totalPapers : null,
  };
}

export function prevalenceChanges(
  data: CompositionData,
  matrix: MomentumMatrixData,
): PrevalenceChangeRow[] {
  const previousWindow = matrix.previous_window;
  const currentWindow = matrix.recent_window;
  if (!previousWindow || !currentWindow) return [];
  const duration = matrix.window_weeks * weekMs;
  if (
    !Number.isInteger(matrix.window_weeks) ||
    matrix.window_weeks < 2 ||
    matrix.window_weeks > 12 ||
    Date.parse(previousWindow.start) % 86400000 !== 0 ||
    Date.parse(previousWindow.end_exclusive) !== Date.parse(currentWindow.start) ||
    Date.parse(previousWindow.end_exclusive) - Date.parse(previousWindow.start) !== duration ||
    Date.parse(currentWindow.end_exclusive) - Date.parse(currentWindow.start) !== duration ||
    new Date(previousWindow.start).getUTCDay() !== 1
  )
    return [];
  return data.topics
    .map((topic) => {
      const previous = periodPrevalence(data, topic.topic_id, previousWindow);
      const current = periodPrevalence(data, topic.topic_id, currentWindow);
      return {
        topicId: topic.topic_id,
        topicName: topic.topic_name,
        previous,
        current,
        change:
          previous.prevalence === null || current.prevalence === null
            ? null
            : current.prevalence - previous.prevalence,
      };
    })
    .sort((a, b) => {
      if (a.change === null) return b.change === null ? a.topicId - b.topicId : 1;
      if (b.change === null) return -1;
      return b.change - a.change || a.topicId - b.topicId;
    });
}

export function prevalenceSelection(
  matrix: MomentumMatrixData,
  topicId: number,
  window: MatrixWindowKind,
): PrevalenceSelection | null {
  const selection = matrixSelection(matrix, topicId, window);
  return selection ? { ...selection, kind: "prevalence-change", metric: "prevalence_pct" } : null;
}

export function formatPercentagePoints(value: number | null): string {
  if (value === null) return "Unavailable";
  // Retain direction for nonzero differences below the display precision.
  if (value !== 0 && Math.abs(value) < 0.01) return `${value > 0 ? "+" : "−"}<0.01 pp`;
  return `${value > 0 ? "+" : ""}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} pp`;
}

// Axis precision follows tick spacing; calculations and inspection retain their precision.
export function prevalenceAxisTicks(extent: number): number[] {
  const target = Number.isFinite(extent) && extent > 0 ? extent : 1;
  const rawStep = target / 2;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const bound = Math.ceil(target / step) * step;
  return Array.from({ length: Math.round((bound * 2) / step) + 1 }, (_, index) =>
    Number((-bound + index * step).toPrecision(12)),
  );
}

export function formatPrevalenceTick(value: number, step: number): string {
  const precision = Math.max(0, Math.min(12, -Math.floor(Math.log10(Math.abs(step) || 1))));
  const rounded = Number(value.toFixed(precision));
  if (rounded === 0) return "0";
  return `${rounded < 0 ? "−" : "+"}${Math.abs(rounded).toLocaleString("en-US", { maximumFractionDigits: precision })} pp`;
}
