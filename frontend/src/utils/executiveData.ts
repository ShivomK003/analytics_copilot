export type ActivityGranularity = "daily" | "weekly" | "monthly";
interface ActivityObservation {
  publication_date?: string;
  week_start?: string;
  month_start?: string;
  paper_count?: number | null;
}
export interface ActivityRow {
  start: string;
  papers: number | null;
  label: string;
  interval: string;
  ongoing: boolean;
}
export function executiveNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "Unavailable" : value.toLocaleString("en-US");
}
export function executiveDate(value: string | null | undefined, includeTime = false): string {
  if (!value || Number.isNaN(Date.parse(value))) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

// Preserve warehouse buckets and null counts; this is labeling, never reaggregation or gap filling.
export function activityRows(
  observations: readonly ActivityObservation[],
  granularity: ActivityGranularity,
  now = new Date(),
): ActivityRow[] {
  const dateKey =
    granularity === "daily"
      ? "publication_date"
      : granularity === "weekly"
        ? "week_start"
        : "month_start";
  return observations
    .map((point) => {
      const start = point[dateKey] ?? "";
      const parsed = new Date(start);
      const valid = Number.isFinite(parsed.getTime());
      const end = new Date(parsed);
      if (valid && granularity === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
      else if (valid) end.setUTCDate(end.getUTCDate() + (granularity === "weekly" ? 7 : 1));
      const lastDay = new Date(end.getTime() - 86_400_000);
      return {
        start,
        papers: point.paper_count ?? null,
        label: valid
          ? new Intl.DateTimeFormat("en-GB", {
              timeZone: "UTC",
              month: "short",
              ...(granularity === "monthly" ? { year: "2-digit" } : { day: "numeric" }),
            }).format(parsed)
          : "Unknown date",
        interval: valid
          ? `${executiveDate(start)}${granularity === "daily" ? "" : ` – ${executiveDate(lastDay.toISOString())}`} · UTC`
          : "Period unavailable",
        ongoing: valid && parsed.getTime() <= now.getTime() && now.getTime() < end.getTime(),
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
