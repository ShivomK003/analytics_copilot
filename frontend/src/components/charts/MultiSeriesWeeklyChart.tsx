import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../feedback/EmptyState";

export type WeeklySeriesItem = {
  week_start: string;
  series_name: string;
  paper_count: number;
};

type MultiSeriesWeeklyChartProps = {
  data: WeeklySeriesItem[];
  emptyTitle: string;
  emptyDescription: string;
  maxSelected?: number;
  selectionMode?: "buttons" | "search";
};

type ChartRow = {
  week_start: string;
  label: string;
  [key: string]: string | number;
};

const COLORS = [
  "#4563eb",
  "#16a085",
  "#e67e22",
  "#9b59b6",
  "#e74c3c",
  "#3498db",
  "#2c3e50",
  "#f39c12",
];

export function MultiSeriesWeeklyChart({
  data,
  emptyTitle,
  emptyDescription,
  maxSelected = 6,
  selectionMode = "buttons",
}: MultiSeriesWeeklyChartProps) {
  const series = useMemo(() => {
    const totals = new Map<string, number>();

    for (const row of data) {
      totals.set(
        row.series_name,
        (totals.get(row.series_name) ?? 0) + row.paper_count,
      );
    }

    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [data]);

  // null means the user has not customized the default selection.
  const [selectedSeries, setSelectedSeries] = useState<string[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const activeSeries =
    selectedSeries === null ? series.slice(0, 3) : selectedSeries;

  const availableSeries = series.filter(
    (name) =>
      !activeSeries.includes(name) &&
      name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  const chartData = useMemo(() => {
    const weeks = new Map<string, ChartRow>();

    for (const row of data) {
      if (!weeks.has(row.week_start)) {
        weeks.set(row.week_start, {
          week_start: row.week_start,
          label: formatDate(row.week_start),
        });
      }

      weeks.get(row.week_start)![row.series_name] = row.paper_count;
    }

    return [...weeks.values()].sort((a, b) =>
      a.week_start.localeCompare(b.week_start),
    );
  }, [data]);

  function toggleSeries(name: string) {
    if (activeSeries.includes(name)) {
      setSelectedSeries(activeSeries.filter((item) => item !== name));
      return;
    }

    if (activeSeries.length >= maxSelected) {
      return;
    }

    setSelectedSeries([...activeSeries, name]);
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="chart-shell">
      {/* Series selector */}
      {selectionMode === "buttons" ? (
        // Button selector for Topics
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {series.map((name) => {
            const selected = activeSeries.includes(name);
            const disabled =
              !selected && activeSeries.length >= maxSelected;

            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => toggleSeries(name)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: selected
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border)",
                  background: selected
                    ? "var(--color-accent)"
                    : "var(--color-surface)",
                  color: selected
                    ? "#ffffff"
                    : "var(--color-text-secondary)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        // Searchable selector for Categories
        <div style={{ marginBottom: 20 }}>
          {/* Selected category chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: 13,
                marginRight: 4,
              }}
            >
              Selected ({activeSeries.length}/{maxSelected})
            </span>

            {activeSeries.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => toggleSeries(name)}
                aria-label={`Remove ${name}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 11px",
                  borderRadius: 8,
                  border: "1px solid var(--color-accent)",
                  background: "var(--color-accent)",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                {name}
                <X size={14} aria-hidden="true" />
              </button>
            ))}
          </div>

          {/* Search input and dropdown */}
          <div style={{ position: "relative", maxWidth: 380 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                background: "var(--color-surface)",
              }}
            >
              <Search
                size={17}
                color="var(--color-text-muted)"
                aria-hidden="true"
              />

              <input
                type="search"
                value={searchQuery}
                disabled={activeSeries.length >= maxSelected}
                placeholder={
                  activeSeries.length >= maxSelected
                    ? `Maximum ${maxSelected} categories selected`
                    : "Search and add a category..."
                }
                aria-label="Search categories"
                aria-expanded={
                  searchOpen && activeSeries.length < maxSelected
                }
                aria-controls="weekly-series-search-results"
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                    event.currentTarget.blur();
                  }
                }}
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--color-text-primary)",
                  fontSize: 14,
                }}
              />
            </div>

            {searchOpen && activeSeries.length < maxSelected && (
              <div
                id="weekly-series-search-results"
                role="group"
                aria-label="Available categories"
                style={{
                  position: "absolute",
                  zIndex: 20,
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  maxHeight: 230,
                  overflowY: "auto",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  background: "var(--color-surface)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {availableSeries.length === 0 ? (
                  <p
                    style={{
                      padding: "12px",
                      color: "var(--color-text-muted)",
                      fontSize: 13,
                    }}
                  >
                    No matching categories.
                  </p>
                ) : (
                  availableSeries.slice(0, 30).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        toggleSeries(name);
                        setSearchQuery("");
                        setSearchOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px 14px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-text-primary)",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <p
            style={{
              marginTop: 10,
              color: "var(--color-text-muted)",
              fontSize: 12,
            }}
          >
            Search available categories and select up to {maxSelected} to
            compare.
          </p>
        </div>
      )}

      {/* Weekly activity chart */}
      <div className="chart-frame chart-frame-line">
        {activeSeries.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--color-text-muted)",
            }}
          >
            Select at least one series to display the chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid
                stroke="rgb(186 198 219 / 0.45)"
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="label"
                tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />

              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.96)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />

              <Legend />

              {activeSeries.map((name) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={name}
                  stroke={COLORS[series.indexOf(name) % COLORS.length]}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}