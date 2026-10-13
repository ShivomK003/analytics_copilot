import { useMemo } from "react";

import {
  MultiSeriesWeeklyChart,
  type WeeklySeriesItem,
} from "./MultiSeriesWeeklyChart";

import type { CategoryWeeklyItem } from "../../types/dashboard";

type WeeklyCategoryChartProps = {
  data: CategoryWeeklyItem[];
};

export function WeeklyCategoryChart({ data }: WeeklyCategoryChartProps) {
  const chartData = useMemo<WeeklySeriesItem[]>(
    () =>
      data.map((item) => ({
        week_start: item.week_start,
        series_name: item.category_code,
        paper_count: item.paper_count,
      })),
    [data],
  );

  return (
    <MultiSeriesWeeklyChart
      data={chartData}
      emptyTitle="No weekly category data"
      emptyDescription="Weekly category activity will appear once data becomes available."
      maxSelected={6}
      selectionMode="search"
    />
  );
}