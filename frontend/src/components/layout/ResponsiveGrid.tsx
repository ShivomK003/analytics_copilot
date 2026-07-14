import type { ReactNode } from "react";

type ResponsiveGridProps = {
  children: ReactNode;
  variant?: "compact" | "standard" | "wide";
};

export function ResponsiveGrid({
  children,
  variant = "standard",
}: ResponsiveGridProps) {
  return <div className={`responsive-grid responsive-grid-${variant}`}>{children}</div>;
}
