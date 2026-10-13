import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../feedback/EmptyState";

type CategoryChartItem = {
  category_code: string;
  paper_count: number;
};

type CategoryDistributionChartProps = {
  data: CategoryChartItem[];
};

const MAX_CATEGORIES = 10;

export function CategoryDistributionChart({
  data,
}: CategoryDistributionChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No category data available"
        description="Category distribution will appear once categorized papers are available."
      />
    );
  }

  const chartData = [...data]
    .sort((a, b) => b.paper_count - a.paper_count)
    .slice(0, MAX_CATEGORIES)
    .map((category) => ({
      categoryCode: category.category_code,
      paperCount: category.paper_count,
    }));

  return (
    <div className="chart-shell">
      <div className="chart-frame chart-frame-bar">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
          >
            <CartesianGrid
              stroke="rgb(186 198 219 / 0.35)"
              strokeDasharray="3 3"
              horizontal={false}
            />

            <XAxis
              type="number"
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "var(--color-text-muted)",
                fontSize: 12,
              }}
              tickFormatter={(value: number) =>
                new Intl.NumberFormat("en-US").format(value)
              }
            />

            <YAxis
              type="category"
              dataKey="categoryCode"
              width={90}
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "var(--color-text-secondary)",
                fontSize: 12,
              }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.96)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                boxShadow: "var(--shadow-sm)",
              }}
              formatter={(value) => [
                new Intl.NumberFormat("en-US").format(Number(value ?? 0)),
                "Papers",
              ]}
            />

            <Bar
              dataKey="paperCount"
              fill="var(--color-accent)"
              radius={[0, 8, 8, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="paperCount"
                position="right"
                fill="var(--color-text-primary)"
                fontSize={12}
                formatter={(value: string | number | boolean | null | undefined) =>
                  new Intl.NumberFormat("en-US").format(Number(value ?? 0))
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}