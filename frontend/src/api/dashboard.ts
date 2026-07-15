import { get } from "./client";
import type { DashboardHomeResponse } from "../types/dashboard";

export function getDashboardHome() {
  return get<DashboardHomeResponse>("/dashboard/home");
}
