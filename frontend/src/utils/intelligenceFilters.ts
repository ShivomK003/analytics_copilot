import type { CoverageData, TopicOption } from "../types/intelligence";

export const rangeOptions = [
  ["4w", "Last 4 weeks"],
  ["12w", "Last 12 weeks"],
  ["26w", "Last 26 weeks"],
  ["52w", "Last 52 weeks"],
  ["all", "All observed data"],
  ["custom", "Custom date range"],
] as const;
export type RangePreset = (typeof rangeOptions)[number][0];
export interface IntelligenceFilters {
  range: RangePreset;
  dateFrom: string;
  dateTo: string;
  topicIds: number[];
}
export interface ResolvedDates {
  date_from?: string;
  date_to?: string;
  notice?: string;
  error?: string;
}
const DAY = 86_400_000;

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
export function shiftUtcDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
export function isIsoDate(day: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day) || day.startsWith("0000")) return false;
  const timestamp = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(timestamp) && utcToday(new Date(timestamp)) === day;
}
function monday(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftUtcDay(day, -((weekday + 6) % 7));
}
export function intersectingWeeks(from: string, to: string): number {
  return Math.round((Date.parse(monday(to)) - Date.parse(monday(from))) / (7 * DAY)) + 1;
}
export function validateCustomDates(from: string, to: string): string | undefined {
  if (!isIsoDate(from) || !isIsoDate(to)) return "Enter both dates in YYYY-MM-DD format.";
  if (from > to) return "The start date must be on or before the end date.";
  if (to === "9999-12-31") return "The end date must allow a following UTC midnight.";
  if (intersectingWeeks(from, to) > 104)
    return "Choose a range intersecting no more than 104 UTC calendar weeks.";
}

/** URL state is the source of truth, including when history navigation changes it. */
export function parseIntelligenceFilters(
  search: URLSearchParams,
  topics?: TopicOption[],
): { filters: IntelligenceFilters; notices: string[] } {
  const notices: string[] = [];
  const rawRange = search.get("range");
  let range: RangePreset =
    rangeOptions.some(([value]) => value === rawRange) && search.getAll("range").length === 1
      ? (rawRange as RangePreset)
      : "12w";
  if (rawRange !== null && (range !== rawRange || search.getAll("range").length !== 1))
    notices.push("Invalid date preset was reset to Last 12 weeks.");
  let dateFrom = search.get("date_from") ?? "";
  let dateTo = search.get("date_to") ?? "";
  if (
    range === "custom" &&
    (search.getAll("date_from").length !== 1 ||
      search.getAll("date_to").length !== 1 ||
      validateCustomDates(dateFrom, dateTo))
  ) {
    range = "12w";
    dateFrom = "";
    dateTo = "";
    notices.push("Invalid custom dates were reset to Last 12 weeks.");
  }
  const rawIds = search.getAll("topic_id");
  const validIds = rawIds
    .filter((value) => /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)))
    .map(Number);
  const knownIds =
    topics === undefined
      ? validIds
      : validIds.filter((id) => topics.some((topic) => topic.topic_id === id));
  if (knownIds.length !== rawIds.length)
    notices.push("Invalid or unavailable topic selections were removed.");
  let topicIds = [...new Set(knownIds)].sort((a, b) => a - b);
  if (topics?.length && topicIds.length === topics.length) topicIds = [];
  return { filters: { range, dateFrom, dateTo, topicIds }, notices };
}

export function serializeIntelligenceFilters(filters: IntelligenceFilters): URLSearchParams {
  const search = new URLSearchParams({ range: filters.range });
  if (filters.range === "custom") {
    search.set("date_from", filters.dateFrom);
    search.set("date_to", filters.dateTo);
  }
  [...new Set(filters.topicIds)]
    .sort((a, b) => a - b)
    .forEach((id) => search.append("topic_id", String(id)));
  return search;
}

/** Presets are rolling UTC days, inclusive of today; all observed uses actual bounds. */
export function resolveIntelligenceDates(
  filters: IntelligenceFilters,
  coverage: CoverageData | undefined,
  today = utcToday(),
): ResolvedDates {
  if (filters.range === "custom") {
    const error = validateCustomDates(filters.dateFrom, filters.dateTo);
    return error ? { error } : { date_from: filters.dateFrom, date_to: filters.dateTo };
  }
  if (filters.range === "all") {
    const from = coverage?.observed_date_from;
    const to = coverage?.observed_date_to;
    if (!from || !to)
      return { error: "Observed dates are unavailable. Choose a relative or custom range." };
    if (intersectingWeeks(from, to) > 104) {
      return {
        date_from: shiftUtcDay(monday(to), -103 * 7),
        date_to: to,
        notice:
          "Observed history exceeds the weekly limit. Showing its most recent 104 intersecting UTC weeks.",
      };
    }
    return { date_from: from, date_to: to };
  }
  const weeks = Number(filters.range.slice(0, -1));
  return {
    date_from: shiftUtcDay(today, -(weeks * 7 - 1)),
    date_to: today,
    notice: `Rolling ${weeks * 7} UTC days through today; boundary weeks may be partial.`,
  };
}

/** Empty IDs mean all topics. Removing the last selection also restores all. */
export function toggleIntelligenceTopic(
  selected: number[],
  topicId: number,
  topics: TopicOption[],
): number[] {
  const ids = new Set(selected.length ? selected : topics.map((topic) => topic.topic_id));
  if (ids.has(topicId)) ids.delete(topicId);
  else ids.add(topicId);
  return ids.size === topics.length ? [] : [...ids].sort((a, b) => a - b);
}
