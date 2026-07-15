import { useQuery } from "@tanstack/react-query";
import { getDashboardHome } from "../api/dashboard";

const DASHBOARD_HOME_QUERY_KEY = ["dashboard-home"] as const;
const DASHBOARD_HOME_STALE_TIME = 5 * 60 * 1000;

export function useDashboardHome() {
  const query = useQuery({
    queryKey: DASHBOARD_HOME_QUERY_KEY,
    queryFn: getDashboardHome,
    staleTime: DASHBOARD_HOME_STALE_TIME,
    refetchOnWindowFocus: true,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
