import { describe, expect, it } from "vitest";
import {
  intersectingWeeks,
  isIsoDate,
  parseIntelligenceFilters,
  resolveIntelligenceDates,
  serializeIntelligenceFilters,
  toggleIntelligenceTopic,
  utcToday,
  validateCustomDates,
} from "../src/utils/intelligenceFilters";
import type { CoverageData, TopicOption } from "../src/types/intelligence";

const topics: TopicOption[] = [2, 5, 8].map((id) => ({
  topic_id: id,
  topic_name: `Topic ${id}`,
  period_paper_count: 0,
  total_indexed_paper_count: 0,
}));
const parse = (value: string) => parseIntelligenceFilters(new URLSearchParams(value), topics);
describe("Intelligence URL filters and UTC intervals", () => {
  it("defaults to 12 weeks and all topics", () => {
    expect(parse("").filters).toEqual({ range: "12w", dateFrom: "", dateTo: "", topicIds: [] });
  });
  it.each([
    ["4w", "2026-09-19"],
    ["12w", "2026-07-25"],
    ["26w", "2026-04-18"],
    ["52w", "2025-10-18"],
  ])("resolves %s as inclusive UTC rolling days", (range, start) => {
    const dates = resolveIntelligenceDates(
      parse(`range=${range}`).filters,
      undefined,
      "2026-10-16",
    );
    expect(dates.date_from).toBe(start);
    expect(dates.date_to).toBe("2026-10-16");
  });
  it("uses UTC even when an input instant is across a local calendar boundary", () => {
    expect(utcToday(new Date("2026-10-16T00:30:00+11:00"))).toBe("2026-10-15");
    expect(intersectingWeeks("2026-10-11", "2026-10-12")).toBe(2);
    expect(intersectingWeeks("2026-10-12", "2026-10-18")).toBe(1);
  });
  it("validates real dates, order, final-day overflow and intersecting-week limit", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(validateCustomDates("2026-10-17", "2026-10-16")).toMatch(/start date/);
    expect(validateCustomDates("2024-10-28", "2026-10-25")).toBeUndefined();
    expect(validateCustomDates("2024-10-27", "2026-10-25")).toMatch(/104/);
    expect(validateCustomDates("9999-12-30", "9999-12-31")).toMatch(/midnight/);
  });
  it("uses observed dates and clips a long corpus to exactly 104 intersecting weeks", () => {
    const filters = parse("range=all").filters;
    const coverage = {
      observed_date_from: "2020-01-01",
      observed_date_to: "2026-10-16",
    } as CoverageData;
    const dates = resolveIntelligenceDates(filters, coverage);
    expect(dates.date_to).toBe("2026-10-16");
    expect(intersectingWeeks(dates.date_from!, dates.date_to!)).toBe(104);
    expect(dates.notice).toMatch(/104/);
    coverage.observed_date_from = "2026-06-17";
    expect(resolveIntelligenceDates(filters, coverage).date_from).toBe("2026-06-17");
    expect(resolveIntelligenceDates(filters, undefined).error).toMatch(/unavailable/);
  });
  it("sorts and repeats numeric topics and round-trips custom dates", () => {
    const { filters } = parse(
      "range=custom&date_from=2026-07-01&date_to=2026-07-31&topic_id=5&topic_id=2&topic_id=5",
    );
    const search = serializeIntelligenceFilters(filters);
    expect(search.getAll("topic_id")).toEqual(["2", "5"]);
    expect(parse(search.toString()).filters).toEqual(filters);
  });
  it.each([
    "range=nope",
    "range=4w&range=12w",
    "range=custom&date_from=bad",
    "range=custom&date_from=2026-02-30&date_to=2026-03-01",
  ])("recovers invalid URL dates: %s", (search) => {
    const result = parse(search);
    expect(result.filters.range).toBe("12w");
    expect(result.notices.length).toBeGreaterThan(0);
  });
  it("removes invalid and unknown topics and represents all as an empty list", () => {
    expect(
      parse("topic_id=-1&topic_id=999&topic_id=2&topic_id=1.5&topic_id=9007199254740992").filters
        .topicIds,
    ).toEqual([2]);
    expect(parse("topic_id=2&topic_id=5&topic_id=8").filters.topicIds).toEqual([]);
    expect(toggleIntelligenceTopic([], 2, topics)).toEqual([5, 8]);
    expect(toggleIntelligenceTopic([5, 8], 2, topics)).toEqual([]);
    expect(toggleIntelligenceTopic([2], 2, topics)).toEqual([]);
  });
});
