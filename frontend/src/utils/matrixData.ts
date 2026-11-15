import type {
  ComparisonWindow,
  MomentumMatrixData,
  MomentumMatrixTopic,
} from "../types/intelligence";
import { shiftUtcDay } from "./intelligenceFilters";

export type MatrixWindowKind = "recent" | "previous";
export interface MatrixSelection {
  topicId: number;
  window: MatrixWindowKind;
  windowWeeks: number;
  start: string;
  endExclusive: string;
  dateFrom: string;
  dateTo: string;
}

// Chart coordinates are backend measures; null growth never becomes a zero coordinate.
export function matrixPoints(topics: MomentumMatrixTopic[]) {
  return topics
    .filter((topic) => topic.growth_percent !== null)
    .map((topic) => ({
      ...topic,
      activity: topic.recent_paper_count,
      change: topic.growth_percent as number,
    }));
}

export function matrixWindowDates(window: ComparisonWindow) {
  return {
    dateFrom: new Date(window.start).toISOString().slice(0, 10),
    dateTo: shiftUtcDay(new Date(window.end_exclusive).toISOString().slice(0, 10), -1),
  };
}

export function matrixSelection(
  data: MomentumMatrixData,
  topicId: number,
  kind: MatrixWindowKind,
): MatrixSelection | null {
  const window = kind === "recent" ? data.recent_window : data.previous_window;
  if (!window) return null;
  return {
    topicId,
    window: kind,
    windowWeeks: data.window_weeks,
    start: window.start,
    endExclusive: window.end_exclusive,
    ...matrixWindowDates(window),
  };
}

export function formatMatrixChange(value: number | null): string {
  if (value === null) return "Unavailable";
  return `${value > 0 ? "+" : ""}${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export const matrixStateLabels = {
  growing: "Growing",
  declining: "Declining",
  stable: "Unchanged",
  no_baseline: "No baseline",
} as const;
