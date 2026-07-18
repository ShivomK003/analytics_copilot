import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendChartPoint } from "../../types/dashboard";

type TrendChartProps = {
  data: TrendChartPoint[];
};

type ChartValue = number | string | readonly (number | string)[] | undefined;

export function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="chart-shell">
      <div className="chart-frame chart-frame-line">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid
              stroke="rgb(186 198 219 / 0.45)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="label"
              minTickGap={28}
              tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              tickFormatter={(value: number) => formatNumber(value)}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={getTooltipStyle()}
              cursor={{ stroke: "rgb(69 99 235 / 0.18)", strokeWidth: 1 }}
              formatter={(value: ChartValue) => [
                formatNumber(normalizeChartValue(value)),
                "Papers",
              ]}
              labelFormatter={(label) => String(label ?? "")}
            />
            <Line
              activeDot={{
                fill: "var(--color-accent)",
                r: 4,
                stroke: "var(--color-surface)",
                strokeWidth: 2,
              }}
              dataKey="value"
              dot={false}
              isAnimationActive={false}
              stroke="var(--color-accent)"
              strokeWidth={3}
              type="linear"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
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
