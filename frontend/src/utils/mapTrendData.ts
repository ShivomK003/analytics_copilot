import type {
  CumulativeTrendPoint,
  DailyTrendPoint,
  MonthlyTrendPoint,
  TrendChartPoint,
  WeeklyTrendPoint,
} from "../types/dashboard";

type TrendApiPoint =
  | CumulativeTrendPoint
  | DailyTrendPoint
  | MonthlyTrendPoint
  | WeeklyTrendPoint;

export function mapTrendData(data: TrendApiPoint[]): TrendChartPoint[] {
  return data.map((point) => ({
    label: formatTrendLabel(point),
    value: getTrendValue(point),
  }));
}

function formatTrendLabel(point: TrendApiPoint): string {
  if ("week_start" in point) {
    return formatDate(point.week_start, {
      month: "short",
      day: "numeric",
    });
  }

  if ("month_start" in point) {
    return formatDate(point.month_start, {
      month: "short",
      year: "numeric",
    });
  }

  if ("publication_date" in point) {
    return formatDate(point.publication_date, {
      month: "short",
      day: "numeric",
    });
  }

  return "Unknown";
}

function getTrendValue(point: TrendApiPoint): number {
  if ("cumulative_papers" in point) {
    return point.cumulative_papers ?? 0;
  }

  return point.paper_count ?? 0;
}

function formatDate(
  value: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", options).format(date);
}
