import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../feedback/EmptyState";
import { ErrorState } from "../feedback/ErrorState";
import { useMonthlyTrends } from "../../hooks/useTrends";
import type { DailyTrendPoint, WeeklyTrendPoint } from "../../types/dashboard";
import { activityRows, executiveNumber } from "../../utils/executiveData";
import type { ActivityGranularity, ActivityRow } from "../../utils/executiveData";
import { ExecutiveLoading, ExecutivePanel } from "./ExecutivePanel";

function ActivityChart({ rows }: { rows: ActivityRow[] }) {
  const gradientId = useId();
  return (
    <>
      <div
        className="executive-activity-chart"
        aria-label="Indexed publication counts by returned warehouse period"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 12, right: 14, bottom: 8, left: 4 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.23} />
                <stop offset="100%" stopColor="var(--color-lavender)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" vertical={false} strokeOpacity={0.6} />
            <XAxis
              dataKey="start"
              tickFormatter={(value: string) =>
                rows.find((row) => row.start === value)?.label ?? value
              }
              minTickGap={38}
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              allowDecimals={false}
              width={58}
              tickFormatter={(value: number) => value.toLocaleString()}
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              filterNull={false}
              wrapperStyle={{ maxWidth: "min(20rem, 85vw)" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as ActivityRow | undefined;
                return active && row ? (
                  <div className="executive-chart-tooltip">
                    <strong>{row.interval}</strong>
                    <p>{executiveNumber(row.papers)} indexed papers</p>
                    {row.ongoing ? <p>Ongoing calendar period · totals may grow</p> : null}
                  </div>
                ) : null;
              }}
            />
            <Area
              type="linear"
              dataKey="papers"
              name="Indexed papers"
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="executive-data-disclosure">
        <summary>Publication activity values</summary>
        <div className="executive-table-scroll">
          <table>
            <caption>Returned publication periods · dates displayed in UTC</caption>
            <thead>
              <tr>
                <th>Period</th>
                <th>Indexed papers</th>
                <th>Calendar status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.start}:${index}`}>
                  <td>{row.interval}</td>
                  <td>{executiveNumber(row.papers)}</td>
                  <td>{row.ongoing ? "Ongoing" : "Past period; coverage unverified"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function PublicationActivity({
  daily,
  weekly,
  isLoading,
  unavailable,
}: {
  daily?: DailyTrendPoint[];
  weekly?: WeeklyTrendPoint[];
  isLoading: boolean;
  unavailable: boolean;
}) {
  const [granularity, setGranularity] = useState<ActivityGranularity>("weekly");
  const monthly = useMonthlyTrends(granularity === "monthly");
  const observations =
    granularity === "monthly" ? monthly.data : granularity === "daily" ? daily : weekly;
  const rows = useMemo(
    () => activityRows(observations ?? [], granularity),
    [observations, granularity],
  );
  const pending = granularity === "monthly" ? monthly.isPending : isLoading;
  let content;
  if (granularity === "monthly" && monthly.error) {
    content = (
      <ErrorState
        title="Monthly activity unavailable"
        description="The other snapshot panels are still available."
        onRetry={() => void monthly.refetch()}
        retryLabel="Retry monthly activity"
      />
    );
  } else if (pending) {
    content = <ExecutiveLoading label="Loading publication activity…" />;
  } else if (granularity !== "monthly" && unavailable && !observations) {
    content = <p className="executive-panel-note">Publication activity is unavailable.</p>;
  } else if (!rows.length) {
    content = (
      <EmptyState
        title="No publication observations"
        description="No indexed publication periods were returned for this view."
      />
    );
  } else {
    content = <ActivityChart rows={rows} />;
  }
  return (
    <ExecutivePanel
      title="Publication Activity"
      description="Indexed papers by publication period"
      className="executive-activity"
      action={
        <div
          className="executive-segmented"
          role="group"
          aria-label="Publication activity granularity"
        >
          {(["daily", "weekly", "monthly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={granularity === value}
              onClick={() => setGranularity(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      }
    >
      {monthly.isFetching && !monthly.isPending && granularity === "monthly" ? (
        <p role="status">Refreshing monthly activity…</p>
      ) : null}
      {content}
      <p className="executive-panel-note">
        Warehouse aggregates · ongoing periods may grow · missing periods are not filled
      </p>
    </ExecutivePanel>
  );
}
