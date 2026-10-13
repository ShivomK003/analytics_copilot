import { useMemo } from "react";

import {
  MultiSeriesWeeklyChart,
  type WeeklySeriesItem,
} from "./MultiSeriesWeeklyChart";

import type { TopicWeeklyItem } from "../../types/dashboard";

type WeeklyTopicChartProps = {
  data: TopicWeeklyItem[];
};

export function WeeklyTopicChart({ data }: WeeklyTopicChartProps) {
  const chartData = useMemo<WeeklySeriesItem[]>(
    () =>
      data.map((item) => ({
        week_start: item.week_start,
        series_name: item.topic_name,
        paper_count: item.paper_count,
      })),
    [data],
  );

  return (
    <MultiSeriesWeeklyChart
      data={chartData}
      emptyTitle="No weekly topic data"
      emptyDescription="Weekly topic activity will appear once data becomes available."
      maxSelected={6}
    />
  );
}