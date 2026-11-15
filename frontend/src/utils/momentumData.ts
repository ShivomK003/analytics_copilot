import type { MomentumData, MomentumPoint } from "../types/intelligence";
import { shiftUtcDay } from "./intelligenceFilters";

export type MomentumMode = MomentumData["mode"];
export interface MomentumSelection {
  topicId: number;
  weekStart: string;
  effectiveStart: string;
  effectiveEndExclusive: string;
  mode: MomentumMode;
  /** Inclusive UTC dates accepted by the evidence endpoint. */
  dateFrom: string;
  dateTo: string;
}
export interface MomentumRow {
  week_start: string;
  values: Record<number, number | null | undefined>;
  points: Record<number, MomentumPoint | undefined>;
}
/** Union only returned weeks; never synthesize observations or replace nulls with zeros. */
export function momentumRows(data: MomentumData): MomentumRow[] {
  const weeks = new Map<string, MomentumRow>();
  for (const topic of data.topics)
    for (const point of topic.points) {
      const row = weeks.get(point.week_start) ?? {
        week_start: point.week_start,
        values: {},
        points: {},
      };
      row.values[topic.topic_id] = data.mode === "count" ? point.paper_count : point.index_value;
      row.points[topic.topic_id] = point;
      weeks.set(point.week_start, row);
    }
  return [...weeks.values()].sort((a, b) => a.week_start.localeCompare(b.week_start));
}
export function momentumSelection(
  topicId: number,
  point: MomentumPoint,
  mode: MomentumMode,
): MomentumSelection {
  return {
    topicId,
    weekStart: point.week_start,
    effectiveStart: point.effective_start,
    effectiveEndExclusive: point.effective_end_exclusive,
    mode,
    dateFrom: new Date(point.effective_start).toISOString().slice(0, 10),
    dateTo: shiftUtcDay(new Date(point.effective_end_exclusive).toISOString().slice(0, 10), -1),
  };
}
export function formatMomentumDate(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
