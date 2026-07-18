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
};

type TopicDistributionChartDatum = {
  paperCount: number;
  topicName: string;
  topicLabel: string;
};

type ChartValue = number | string | readonly (number | string)[] | undefined;

const MAX_TOPICS = 8;

export function TopicDistributionChart({ data }: TopicDistributionChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        description="Topic distribution will appear here once topic-tagged papers are available."
        title="No topic data available"
      />
    );
  }

  const chartData: TopicDistributionChartDatum[] = [...data]
    .sort((left, right) => right.paper_count - left.paper_count)
    .slice(0, MAX_TOPICS)
    .map((topic) => ({
      paperCount: topic.paper_count ?? 0,
      topicLabel: truncateTopicName(topic.topic_name),
      topicName: topic.topic_name ?? "Unknown topic",
    }));

  return (
    <div className="chart-shell">
      <div className="chart-frame chart-frame-bar">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 28, bottom: 4, left: 8 }}
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
              width={112}
            />
            <Tooltip
              contentStyle={getTooltipStyle()}
              cursor={{ fill: "rgb(69 99 235 / 0.06)" }}
              formatter={(value: ChartValue) => [
                formatNumber(normalizeChartValue(value)),
                "Papers",
              ]}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.topicName ?? ""
              }
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
                  formatNumber(Number(value ?? 0))
                }
                position="right"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-caption">
        Percentages may exceed 100% because papers can belong to multiple topics
      </p>
    </div>
  );
}

function truncateTopicName(value: string | null | undefined): string {
  const safeValue = value ?? "Unknown topic";

  if (safeValue.length <= 18) {
    return safeValue;
  }

  return `${safeValue.slice(0, 15)}...`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function normalizeChartValue(value: ChartValue): number {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0);
  }

  return Number(value ?? 0);
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
