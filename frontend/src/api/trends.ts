import { get } from "./client";
import type {
  CumulativeTrendPoint,
  DailyTrendPoint,
  MonthlyTrendPoint,
  WeeklyTrendPoint,
} from "../types/dashboard";

export function getDailyTrends() {
  return get<DailyTrendPoint[]>("/trends/daily");
}

export function getWeeklyTrends() {
  return get<WeeklyTrendPoint[]>("/trends/weekly");
}

export function getMonthlyTrends() {
  return get<MonthlyTrendPoint[]>("/trends/monthly");
}

export function getCumulativeTrends() {
  return get<CumulativeTrendPoint[]>("/trends/cumulative");
}
