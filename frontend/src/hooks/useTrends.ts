import { useQuery } from "@tanstack/react-query";
import {
  getCumulativeTrends,
  getDailyTrends,
  getMonthlyTrends,
  getWeeklyTrends,
} from "../api/trends";

const TRENDS_STALE_TIME = 5 * 60 * 1000;

export function useDailyTrends() {
  return useQuery({
    queryKey: ["trends", "daily"],
    queryFn: getDailyTrends,
    staleTime: TRENDS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useWeeklyTrends() {
  return useQuery({
    queryKey: ["trends", "weekly"],
    queryFn: getWeeklyTrends,
    staleTime: TRENDS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useMonthlyTrends() {
  return useQuery({
    queryKey: ["trends", "monthly"],
    queryFn: getMonthlyTrends,
    staleTime: TRENDS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCumulativeTrends() {
  return useQuery({
    queryKey: ["trends", "cumulative"],
    queryFn: getCumulativeTrends,
    staleTime: TRENDS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}
