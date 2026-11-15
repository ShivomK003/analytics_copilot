import type { CompositionData, CompositionWeek } from "../types/intelligence";
import { shiftUtcDay } from "./intelligenceFilters";

export type CompositionObservation = CompositionWeek["topics"][number];
export interface CompositionRow {
  week_start: string;
  week: CompositionWeek;
  values: Record<number, number | null | undefined>;
  observations: Record<number, CompositionObservation | undefined>;
}
export interface CompositionSelection {
  kind: "composition";
  topicIds: [number];
  weekStart: string;
  effectiveStart: string;
  effectiveEndExclusive: string;
  dateFrom: string;
  dateTo: string;
  metric: "prevalence_pct";
  isPartialWeek: boolean;
  includePartialWeeks: boolean;
}

// Keep the returned percentages and denominator intact; never normalize overlapping topics.
export function compositionRows(data: CompositionData): CompositionRow[] {
  return [...data.weeks]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((week) => ({
      week_start: week.week_start,
      week,
      values: Object.fromEntries(
        week.topics.map((topic) => [topic.topic_id, topic.prevalence_pct]),
      ),
      observations: Object.fromEntries(week.topics.map((topic) => [topic.topic_id, topic])),
    }));
}
export function compositionDates(week: CompositionWeek) {
  return {
    dateFrom: new Date(week.effective_start).toISOString().slice(0, 10),
    dateTo: shiftUtcDay(new Date(week.effective_end_exclusive).toISOString().slice(0, 10), -1),
  };
}
export function compositionSelection(
  topicId: number,
  week: CompositionWeek,
  includePartialWeeks: boolean,
): CompositionSelection | null {
  if (!week.topics.some((topic) => topic.topic_id === topicId)) return null;
  return {
    kind: "composition",
    topicIds: [topicId],
    weekStart: week.week_start,
    effectiveStart: week.effective_start,
    effectiveEndExclusive: week.effective_end_exclusive,
    ...compositionDates(week),
    metric: "prevalence_pct",
    isPartialWeek: week.is_partial_week,
    includePartialWeeks,
  };
}
export function formatPrevalence(value: number | null | undefined): string {
  return value == null
    ? "Unavailable"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}%`;
}
