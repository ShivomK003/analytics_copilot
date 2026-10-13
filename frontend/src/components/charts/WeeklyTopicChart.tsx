import { useMemo, useState } from "react";

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
import type { TopicWeeklyItem } from "../../types/dashboard";

type WeeklyTopicChartProps = {
  data: TopicWeeklyItem[];
};

type ChartRow = {
  week_start: string;
  label: string;
  [topic: string]: string | number;
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

export function WeeklyTopicChart({ data }: WeeklyTopicChartProps) {
  const topics = useMemo(() => {
    const totals = new Map<string, number>();

    for (const row of data) {
      totals.set(
        row.topic_name,
        (totals.get(row.topic_name) ?? 0) + row.paper_count,
      );
    }

    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [data]);

  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const activeTopics =
    selectedTopics.length === 0 ? topics.slice(0, 3) : selectedTopics;

  const chartData = useMemo(() => {
    const weeks = new Map<string, ChartRow>();

    for (const row of data) {
      if (!weeks.has(row.week_start)) {
        weeks.set(row.week_start, {
          week_start: row.week_start,
          label: formatDate(row.week_start),
        });
      }

      weeks.get(row.week_start)![row.topic_name] = row.paper_count;
    }

    return [...weeks.values()].sort((a, b) =>
      a.week_start.localeCompare(b.week_start),
    );
  }, [data]);

  if (data.length === 0) {
    return (
      <EmptyState
        title="No weekly topic data"
        description="Weekly topic activity will appear once data becomes available."
      />
    );
  }

  function toggleTopic(topic: string) {
    const current = activeTopics;

    if (current.includes(topic)) {
      setSelectedTopics(current.filter((item) => item !== topic));
    } else {
      setSelectedTopics([...current, topic]);
    }
  }

  return (
    <div className="chart-shell">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {topics.map((topic) => {
          const selected = activeTopics.includes(topic);

          return (
            <button
              key={topic}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleTopic(topic)}
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
                cursor: "pointer",
              }}
            >
              {topic}
            </button>
          );
        })}
      </div>

      <div className="chart-frame chart-frame-line">
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

            {activeTopics.map((topic) => (
              <Line
                key={topic}
                type="monotone"
                dataKey={topic}
                name={topic}
                stroke={COLORS[topics.indexOf(topic) % COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
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