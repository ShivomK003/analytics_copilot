import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../feedback/EmptyState";
import type { TopicDistributionItem } from "../../types/dashboard";

type TopicDistributionChartProps = {
  data: TopicDistributionItem[];
  compact?: boolean;
};

type TopicDistributionChartDatum = {
  paperCount: number | null;
  topicName: string;
  topicLabel: string;
};

type ChartValue = number | string | readonly (number | string)[] | undefined;

const MAX_TOPICS = 8;

export function TopicDistributionChart({ data, compact = false }: TopicDistributionChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        description="Topic distribution will appear here once topic-tagged papers are available."
        title="No topic data available"
      />
    );
  }

  const chartData: TopicDistributionChartDatum[] = [...data]
    .sort((left, right) => (right.paper_count ?? -Infinity) - (left.paper_count ?? -Infinity))
    .slice(0, MAX_TOPICS)
    .map((topic) => ({
      paperCount: topic.paper_count ?? null,
      topicLabel: truncateTopicName(topic.topic_name, compact ? 13 : 18),
      topicName: topic.topic_name ?? "Unknown topic",
    }));

  return (
    <div className="chart-shell">
      <div className="chart-frame chart-frame-bar">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: compact ? 52 : 28, bottom: 4, left: compact ? 0 : 8 }}
          >
            <CartesianGrid
              stroke="rgb(186 198 219 / 0.35)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              allowDecimals={false}
              axisLine={false}
              type="number"
              dataKey="paperCount"
              tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              tickFormatter={(value: number) => formatNumber(value)}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              type="category"
              dataKey="topicLabel"
              tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
              tickLine={false}
              width={compact ? 90 : 112}
            />
            <Tooltip
              contentStyle={getTooltipStyle()}
              cursor={{ fill: "rgb(69 99 235 / 0.06)" }}
              formatter={(value: ChartValue) => [
                formatNumber(normalizeChartValue(value)),
                "Papers",
              ]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.topicName ?? ""}
            />
            <Bar
              activeBar={{ fill: "var(--color-accent-hover)" }}
              dataKey="paperCount"
              fill="var(--color-accent)"
              isAnimationActive={false}
              radius={[0, 8, 8, 0]}
            >
              {chartData.map((item) => (
                <Cell fill="var(--color-accent)" key={item.topicName} />
              ))}
              <LabelList
                dataKey="paperCount"
                fill="var(--color-text-primary)"
                fontSize={12}
                formatter={(value: string | number | boolean | null | undefined) =>
                  value == null ? "Unavailable" : formatNumber(Number(value))
                }
                position="right"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-caption">Papers can belong to multiple topics; topic counts overlap.</p>
    </div>
  );
}

function truncateTopicName(value: string | null | undefined, maximum: number): string {
  const safeValue = value ?? "Unknown topic";

  if (safeValue.length <= maximum) {
    return safeValue;
  }

  return `${safeValue.slice(0, maximum - 3)}...`;
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US").format(value);
}

function normalizeChartValue(value: ChartValue): number | null {
  if (Array.isArray(value)) {
    return value[0] == null ? null : Number(value[0]);
  }

  return value == null ? null : Number(value);
}

function getTooltipStyle() {
  return {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    boxShadow: "var(--shadow-sm)",
    color: "var(--color-text-primary)",
  };
}
